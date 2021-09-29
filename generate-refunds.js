const Arweave = require("arweave");
const arGql = require("ar-gql");
const fs = require("fs");
const path = require("path");
const { default: Verto } = require("@verto/js");
const axios = require("axios");

// set trading post address here
const tradingPostAddress = "";

const arweave = new Arweave({
  host: "arweave.net",
  port: "443",
  protocol: "https"
});
const client = new Verto();
const CACHE_URL = "https://v2.cache.verto.exchange";

/// MINIMUM BLOCK HEIGHT
const MIN_BLOCK = 699977;

let CURRENT_BLOCK = MIN_BLOCK;

const mapFileName = path.join(__dirname, "./refund.map.json");
let mapData = [];

(async () => {  
  // get orders for post by getting the post url
  const post = (await client.getTradingPosts()).find(({ address }) => address === tradingPostAddress);
  const postURL = post.endpoint.replace("/ping", "");
  const { data: orders } = await axios.get(`${postURL}/orders`);
  ///

  CURRENT_BLOCK = (await arweave.network.getInfo()).height;

  try {
    await loopRefund(undefined, orders);
  } catch (e) {
    console.log(`Error looping through refund: ${e}`);
  }

  // Create a refunds map file
  fs.writeFileSync(mapFileName, JSON.stringify(mapData, null, 2));
})();

async function loopRefund(after, orders) {
  const ordersTxs = await arGql.run(`
    query($address: String!, $after: String) {
      transactions(
        recipients: [$address]
        tags: [
          { name: "Exchange", values: "Verto" }
          { name: "Type", values: ["Buy", "Sell"] }
        ]
        after: $after
        first: 50
        block: {
          min: ${MIN_BLOCK}
          max: ${CURRENT_BLOCK}
        }
      ) {
        pageInfo {
          hasNextPage
        }
        edges {
          cursor
          node {
            id
            owner {
              address
            }
            tags {
              name
              value
            }
            quantity {
              ar
            }
          }
        }
      }
    }  
  `, { address: tradingPostAddress, after });
  let lastCursor = "";

  // loop through orders for the trading post
  for (const { cursor, node: { id, owner: { address: owner }, tags, quantity: { ar: arQty } } } of ordersTxs.data.transactions.edges) {
    lastCursor = cursor;

    // handle sell orders
    if (getTagValue("Type", tags) === "Sell") {
      // get the initial amount of tokens sent to the trading post
      let { qty: refundAmount } = JSON.parse(getTagValue("Input", tags));
      // try find the order from the trading post API
      const orderData = orders.find(({ token }) => token === getTagValue("Contract", tags))?.orders.find(({ txID }) => txID === id);

      // check if the order is in the orderbook
      if (orderData) {
        // update refund amount, subtract already filled / traded tokens
        refundAmount = orderData.amnt - orderData.received;

        if (refundAmount > orderData.amnt) {
          console.error(`Invlid refund amount for order "${id}". Skipping...`);
          continue;
        }
      }

      // if the order was filled already, continue
      if (refundAmount <= 0) continue;

      // check if it was successfully cancelled
      const cancelRes = await arGql.run(`
        query ($orderID: [String!]!) {
          transactions(
            tags: [
              { name: "Exchange", values: "Verto" }
              { name: "Type", values: "Cancel-PST-Transfer" }
              { name: "Order", values: $orderID }
            ]
          ) {
            edges {
              node {
                id
              }
            }
          }
        }      
      `, { orderID: id });

      // if cancel return tx exists, continue
      if (cancelRes.data.transactions.edges.length > 0) continue;

      try {
        const transferTransaction = await arweave.createTransaction({
          target: owner,
          quantity: "0",
          data: "This is a trading post refund transaction."
        });

        transferTransaction.addTag("Exchange", "Verto");
        transferTransaction.addTag("Action", "Transfer");
        transferTransaction.addTag("Type", "Refund");
        transferTransaction.addTag("Order", id);
        transferTransaction.addTag("App-Name", "SmartWeaveAction");
        transferTransaction.addTag("App-Version", "0.3.0");
        transferTransaction.addTag("Contract", getTagValue("Contract", tags));
        transferTransaction.addTag("Input", JSON.stringify({
          function: "transfer",
          target: owner,
          qty: refundAmount
        }));

        console.log(`[Sell Order] Refund ${refundAmount} of ${getTagValue("Contract", tags)} to ${owner}. (OrderID: ${id})`);
        mapData.push({
          type: "Sell",
          result: "success",
          id,
          amount: refundAmount,
          token: getTagValue("Contract", tags),
          recipient: owner,
          transaction: transferTransaction
        });
      } catch (e) {
        console.error(`Could not refund ${id}`);
        console.log(e);
        mapData.push({
          type: "Sell",
          result: "error",
          id,
          error: e
        });
      }
    }

    // handle buy orders
    if (getTagValue("Type", tags) === "Buy") {
      // how much AR was sent with this buy order
      let refundAmount = arQty;
      // try to get the order from the cache
      const { data: orderData } = await axios.get(`${CACHE_URL}/order/${id}`);

      // if the order was successful, cancelled or returned, there is no need to refund anything
      if (orderData?.status === "success" || orderData?.status === "returned" || orderData?.status === "refunded") continue;

      // check if it was successfully cancelled
      const cancelRes = await arGql.run(`
        query ($orderID: [String!]!) {
          transactions(
            tags: [
              { name: "Exchange", values: "Verto" }
              { name: "Type", values: "Cancel-AR-Transfer" }
              { name: "Order", values: $orderID }
            ]
          ) {
            edges {
              node {
                id
              }
            }
          }
        }      
      `, { orderID: id });

      // if cancel return tx exists, continue
      if (cancelRes.data.transactions.edges.length > 0) continue;

      try {
        const refundTx = await arweave.createTransaction({
          target: owner,
          quantity: arweave.ar.arToWinston(refundAmount)
        });

        refundTx.addTag("Exchange", "Verto");
        refundTx.addTag("Type", "Refund");
        refundTx.addTag("Order", id);

        console.log(`[Buy Order] Refund ${refundAmount} AR to ${owner}. (OrderID: ${id}`);
        mapData.push({
          type: "Buy",
          result: "success",
          id,
          amount: refundAmount,
          token: "AR",
          recipient: owner,
          transaction: refundTx
        });
      } catch (e) {
        console.error(`Could not refund ${id}`);
        console.log(e);
        mapData.push({
          type: "Buy",
          result: "error",
          id,
          error: e
        });
      }
    }
  }

  if (ordersTxs.data.transactions.pageInfo.hasNextPage)
    await loopRefund(lastCursor, orders);
  else
    console.log("All orders refunded")
}

/**
 * Get a tag's value
 * 
 * @param {string} tagName Name of the tag
 * @param {{ name: string, value: string }[]} tags Tags array
 */
const getTagValue = (tagName, tags) => tags.find(({ name }) => name === tagName).value;
