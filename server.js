require("dotenv").config();
const ftxApi = require("ftx-api");
const awsSDK = require("aws-sdk");
const express = require("express");
const https = require("https");
const crypto = require("crypto-js");
const axios = require("axios");
const random = require("random");
const { format } = require("date-fns");
const NodeCache = require("node-cache");
const Promise = require("bluebird");
const app = express();
const cryptoAssetsToBuy = ["GRT", "ETH", "BTC", "SOL"];
const cache = new NodeCache();
cache.set("marketOrders", "[]", 1000 * 60 * 60);

//Configure awsSdk options.
awsSDK.config.update({
  region: "us-east-1",
  accessKeyId: <Access Key id>,
  secretAccessKey: <Secret Access Key>,
});

const queueUrl = <Queue Url>;

const createSendMessageParams = (messageTitle, messageBody) => ({
  DelaySeconds: 0,
  MessageAttributes: {
    Title: {
      DataType: "String",
      StringValue: messageTitle,
    },
  },
  MessageBody: JSON.stringify(messageBody),
  MessageGroupId: "order-placement-queue.fifo",
  QueueUrl: queueUrl,
});

const createReceiveMessageParams = () => ({
  AttributeNames: ["SentTimestamp"],
  MaxNumberOfMessages: 10,
  MessageAttributeNames: ["All"],
  QueueUrl: queueUrl,
  VisibilityTimeout: 20,
  WaitTimeSeconds: 0,
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const client = new ftxApi.RestClient(
    process.env.FTX_API_KEY,
    process.env.FTX_API_SECRET,
    { domain: "ftxus" }
  );
  //Define new sqs queue.
  const sqsQueue = new awsSDK.SQS({ apiVersion: "2012-11-05" });
  app.set("client", client);
  app.set("cache", cache);
  app.set("queue", sqsQueue);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.get("/api/check_orders", async (req, res) => {
  const apiClient = app.get("client");

  const cache = app.get("cache");
  const marketOrders = JSON.parse(
    cache.get("marketOrders") ? cache.get("marketOrders") : "{}"
  );
  let currentMarketPricesResponse = await apiClient.getMarkets();
  let currentMarketPrices = currentMarketPricesResponse.result
    .filter((m) => m.name === `GRT/USD`)
    .map((m) => m.ask);

  Promise.map(
    currentMarketPrices,
    (currentMarketPrice) => {
      const filteredMarketOrders = marketOrders.filter(
        (marketOrder) => marketOrder.price <= currentMarketPrice
      );
      if (filteredMarketOrders.length) {
        const marketOrdersToFulfill = filteredMarketOrders.map((mO) =>
          apiClient.placeOrder({ ...mO, price: currentMarketPrice })
        );
        return Promise.all(marketOrdersToFulfill).then((marketOrdersFilled) => {
          /* Set orders */
          const marketOrdersToSet = marketOrders.filter(
            (marketOrder) =>
              !filteredMarketOrders.some(
                (fMarketOrder) =>
                  JSON.stringify(fMarketOrder) === JSON.stringify(marketOrder)
              )
          );
          cache.set("marketOrders", JSON.stringify(marketOrdersToSet));
          console.info(`${marketOrdersToFulfill.length} Orders Fulfilled`);
          /* Indicate how many orders are fullfilled. */
          res.json({
            message: `${marketOrdersToFulfill.length} Orders Fulfilled`,
          });
        });
      }
      console.info(`No Orders fulfilled`);
      res.json({ message: "No Orders fulfilled" });
    },
    { concurrency: 2 }
  ).catch((error) => {
    res.json({ error: error });
  });
});

app.get("/api/get-subaccounts", async (req, res) => {
  const apiClient = app.get("client");
  const cache = app.get("cache");
  console.log("cache:", cache.get("test"));
  const subaccounts = await apiClient.getSubaccounts();
  res.json({ subaccounts });
});

app.post("/api/create-subaccounts", async (req, res) => {
  try {
    const { nickname } = req.body;
    const nicknameToAdd = `${nickname} - Created on ${format(
      new Date(),
      "MM-dd-yyyy"
    )} - ${Math.floor(Math.random() * 1000)}`;
    console.log("nicknameTOAdd:", nicknameToAdd);
    const apiClient = app.get("client");
    await apiClient.createSubaccount(nicknameToAdd);
    res.json({ subaccount: nicknameToAdd });
  } catch (err) {
    console.log("ERROR:", err);
    res.json({ error: err });
  }
});

app.post("/api/place-order", async (req, res) => {
  // const { buyOrder, sellOrder } = req.body;
  const cryptoAssetBuyAndSell = cryptoAssetsToBuy.find(
    (cryptoAsset) => cryptoAsset === "GRT"
  );
  const apiClient = app.get("client");
  const cache = app.get("cache");
  const queue = app.get('queue');
  try {
    if (!cryptoAssetBuyAndSell) throw new Error("Asset not available to buy.");
    const ordersToPlace = [
      {
        market: `${cryptoAssetBuyAndSell}/USD`,
        subaccount: "Main Account",
        side: "buy",
        price: 0.15355,
        type: "market",
        size: 3,
        reduceOnly: false,
      },
      {
        market: `${cryptoAssetBuyAndSell}/USD`,
        subaccount: "Main Account",
        side: "sell",
        price: 0.15355,
        type: "market",
        size: 3,
        reduceOnly: false,
      },
    ];
    const params = createSendMessageParams("Place Order:", ordersToPlace);
    cache.set("marketOrders", JSON.stringify(ordersToPlace));
    queue.sendMessage(params, (err, data) => console.log("Order Placed:", data));
    console.log(cache.get("marketOrders"));
    res.json({ success: true });
  } catch (e) {
    console.error("buy failed: ", e);
    res.json({ error: e });
  }
});

app.listen(process.env.PORT, () => console.log("Listening on Port 81"));

setInterval(async () => {
  await axios
    .get("http://localhost:81/api/check_orders", {})
    .catch((error) => console.log("ERROR:", error));
}, 30 * 1000);
