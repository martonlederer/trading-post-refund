const fs = require("fs");
const path = require("path");

const refundMapPath = path.join(__dirname, "./refund.map.json");
const refundMap = JSON.parse(fs.readFileSync(refundMapPath));
const addressesFilePath = path.join(__dirname, "./balances.json");

console.log("Working... This generates a balances object for an NFT");

let balances = {};

(async () => {
  for (const refund of refundMap) {
    if (balances[refund.recipient]) continue;
    balances[refund.recipient] = 1;
  }

  // Overrides refunds map file
  fs.writeFileSync(addressesFilePath, JSON.stringify(balances, null, 2));

  console.log(`Created balances file at ${addressesFilePath}`);
})();