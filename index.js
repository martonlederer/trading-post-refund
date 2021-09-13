const Arweave = require("arweave");
const arGql = require("ar-gql");
const fs = require("fs");
const path = require("path");
const { default: Verto } = require("@verto/js");
const axios = require("axios");

/**const walletFile = fs.readFileSync(path.join(__dirname, "./arweave.json"));
const wallet = JSON.parse(new TextDecoder().decode(walletFile));**/

const arweave = new Arweave({
  host: "arweave.net",
  port: "443",
  protocol: "https"
});
const client = new Verto();
const CACHE_URL = "https://v2.cache.verto.exchange";

//const walletAddress = await arweave.wallets.jwkToAddress(wallet);

// TODO remove this, read it from the wallet file
const walletAddress = "WNeEQzI24ZKWslZkQT573JZ8bhatwDVx6XVDrrGbUyk";
/*
(async () => {
  let after = undefined;

  const ordersTxs = await arGql.run(`
    query($address: String!, $after: String) {
      transactions(
        recipients: [$address]
        tags: [
          { name: "Exchange", values: "Verto" }
          { name: "Type", values: ["Buy", "Sell"] }
        ]
        after: $after
      ) {
        edges {
          cursor
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }  
  `, {
    address: walletAddress,
    after
  });

  for (const { cursor, node: { id, tags } } of ordersTxs.data.transactions.edges) {
    after = cursor;

    if (tags.find(({ name }) => name === "Type").value === "Sell") {
      const { data:  } = await axios.get(`${CACHE_URL}/order/${id}`);
      const tradingPost
    }
  }
})();*/

/*
// if it is in the order book
(async () => {
  // get balances of the trading post
  const balances = await client.getBalances(walletAddress)
  
  for (const balance of balances) {
    // get orders for this token
    const orders = await client.getOrderBook(walletAddress, balance.id);

    for (const order of orders) {
      // sell orders
      if (order.type === "Sell") {
        // refund amount
        const toRefund = order.amnt - order.received;

        // filled orders don't get refund
        if (toRefund <= 0) continue;

        // transfer
        //await client.transfer(toRefund, balance.id, order.addr);
      } else {
      // buy orders
        if (order.)
      }
    }
  }
})();*/

(async () => {
  // get orders for post by getting the post url
  const post = (await client.getTradingPosts()).find(({ address }) => address === walletAddress);
  const postURL = post.endpoint.replace("/ping", "");
  const { data: orders } = await axios.get(`${postURL}/orders`);
  ///

  loopRefund(undefined, walletAddress, orders)
})();

async function loopRefund(after, address, orders) {
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
      ) {
        pageInfo {
          hasNextPage
        }
        edges {
          cursor
          node {
            id
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
  `, { address, after });
  let lastCursor = "";

  // loop through orders for the trading post
  for (const { cursor, node: { id, tags, quantity: { ar: arQty } } } of ordersTxs.data.transactions.edges) {
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

      console.log(`[Sell Order] Refund qty ${refundAmount} of ${getTagValue("Contract", tags)}. (${id})`);
      // TODO: refund sell here, send back the psts
    }

    // handle buy orders
    if (getTagValue("Type", tags) === "Buy") {
      // how much AR was sent with this buy order
      let refundAmount = arQty;
      // try to get the order from the cache
      const { data: orderData } = await axios.get(`https://v2.cache.verto.exchange/order/${id}`);

      // if the order was successful, cancelled or returned, there is no need to refund anything
      if (orderData?.status === "success" || orderData?.status === "returned" || orderData?.status === "cancelled" || orderData?.status === "refunded") continue;

      /**
      // THIS IS NOT NEEDED
      // if the order was cancelled, check if the cancel tx was sent
      if (orderData?.status === "cancelled") {
        const cancelTxQuery = await arGql.run(`
          query($orderID: [String!]!) {
            transactions(
              tags: [
                { name: "Exchange", values: "Verto" }
                { name: "Type", values: "Cancel-PST-Transfer" }
                { name: "Order", values: $orderID }
              ]
            ) {
              edges {
                node {
                  tags {
                    name
                    value
                  }
                }
              }
            }
          }
        `, { orderID: id });

        // if there is a cancel tx, check if it sent the right amount of back
        if(cancelTxQuery.data.transactions.edges.length !== 0) 
      }**/

      console.log(`[Buy Order] Refund ${refundAmount} AR. (${id})`);
      // TODO: refund buy here, send back the AR
    }
  }

  if (ordersTxs.data.transactions.pageInfo.hasNextPage)
    loopRefund(lastCursor, address, orders);
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
