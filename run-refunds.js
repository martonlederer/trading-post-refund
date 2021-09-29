const Arweave = require("arweave");
const fs = require("fs");
const path = require("path");

const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, "./arweave.json")));
const refundMap = JSON.parse(fs.readFileSync(path.join(__dirname, "./refund.map.json")));

const arweave = new Arweave({
  host: "arweave.net",
  port: "443",
  protocol: "https"
});
const logFileName = path.join(__dirname, "./refund.map.json");
let logData = [];

(async () => {
  for (const { transaction: rawTx, id } of refundMap) {
    const transaction = arweave.transactions.fromRaw({
      ...rawTx,
      owner: wallet.n
    });

    try {
      await arweave.transactions.sign(transaction, wallet);
      await arweave.transactions.post(transaction);

      logData.push({
        orderID: id,
        txID: transaction.id
      });
      console.log(`Refunded ${id}`);
    } catch (e) {
      console.log(`Could not refund order ${id}:`);
      console.log(e);
    }
  }

  // Create a refunds log file
  fs.writeFileSync(logFileName, JSON.stringify(logData, null, 2));

  console.log("Finished refunding");
})();