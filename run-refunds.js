const Arweave = require("arweave");
const fs = require("fs");
const path = require("path");

const feeMultiplier = 100;
const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, "./arweave.json")));
const refundMap = JSON.parse(fs.readFileSync(path.join(__dirname, "./refund.map.json")));

const arweave = new Arweave({
  host: "arweave.net",
  port: "443",
  protocol: "https"
});
const logFileName = path.join(__dirname, "./refund.log.json");
let logData = [];

(async () => {
  for (const { transaction: rawTx, id } of refundMap) {
    const transaction = arweave.transactions.fromRaw({
      ...rawTx,
      owner: wallet.n
    });

    transaction.reward = Math.round(parseFloat(transaction.reward) * feeMultiplier).toString();

    try {
      await arweave.transactions.sign(transaction, wallet);
      
      const uploader = await client.transactions.getUploader(transaction);

      while (!uploader.isComplete) {
        await uploader.uploadChunk();
      }

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