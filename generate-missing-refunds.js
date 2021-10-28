const Arweave = require("arweave");
const fs = require("fs");
const path = require("path");

// this will override the refund map file to be submited again

const refundMapPath = path.join(__dirname, "./refund.map.json");
const refundMap = JSON.parse(fs.readFileSync(refundMapPath));
const refundLog = JSON.parse(fs.readFileSync(path.join(__dirname, "./refund.log.json")));

const arweave = new Arweave({
  host: "arweave.net",
  port: "443",
  protocol: "https"
});

let mapData = [];

(async () => {
  for (const refund of refundLog) {
    const { status } = await arweave.transactions.getStatus(refund.txID);
    const txData = refundMap.find((tx) => tx.id === refund.orderID);

    if (status === 200) continue;

    mapData.push(txData);
  }

  // Overrides refunds map file
  fs.writeFileSync(refundMapPath, JSON.stringify(mapData, null, 2));

  console.log(`Overwritten ${refundMapPath}`);
})();