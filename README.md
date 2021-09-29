# Trading Post Refund Script

When executed, this code automatically refunds all transactions that were missed during the gateway outage period.

## How to run

1. Clone this repository
2. Place your keyfile in the root of the cloned repo folder and rename it to `arweave.json`
3. Place the `refund.map.json` file sent to you by Tate in the root of this repository
4. Run `yarn`
5. Run `yarn execute-refunds`
6. Send the new outputted `refund.log.json` file to Tate