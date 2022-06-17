require("dotenv").config();
const ftxApi = require("ftx-api");
const express = require("express");
const https = require("https");
const crypto = require("crypto-js");
const axios = require("axios");
const random = require("random");
const { format } = require("date-fns");
const NodeCache = require("node-cache");
const Promise = require("bluebird");
const app = express();
const { BinarySearchTree } = require('./BinarySearchTree');

const cryptoAssetsToBuy = ["GRT", "ETH", "BTC", "SOL"];
const cache = new NodeCache();
cache.set("marketOrders", "[]", 1000 * 60 * 60);

app.use(express.json());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const client = new ftxApi.RestClient(
    process.env.FTX_API_KEY,
    process.env.FTX_API_SECRET,
    { domain: "ftxus" }
  );
  const binarySearchTree = new BinarySearchTree();
  app.set("client", client);
  app.set("cache", cache);
  app.set("binarySearchTree", binarySearchTree);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.get("/api/check_orders", async (req, res) => {
  const apiClient = app.get("client");

  const cache = app.get("cache");
  const binarySearchTree = app.get('binarySearchTree');
  const marketOrders = JSON.parse(
    cache.get("marketOrders") ? cache.get("marketOrders") : "{}"
  );
  let currentMarketPricesResponse = await apiClient.getMarkets();
  let currentMarketPrices = currentMarketPricesResponse.result.filter((m) =>
    m.name === `GRT/USD`
  )
  .map(m => m.ask);
  console.log('binarySearchTree:', binarySearchTree);
  console.log('binarySearchTree item:', binarySearchTree.search(0.0977));
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
  const binarySearchTree = app.get('binarySearchTree');
  try {
    if (!cryptoAssetBuyAndSell) throw new Error("Asset not available to buy.");
    const ordersToPlace = [
      {
        market: `${cryptoAssetBuyAndSell}/USD`,
        subaccount: "Main Account",
        side: "buy",
        price: 0.0977,
        type: "market",
        size: 3,
        reduceOnly: false,
      },
      {
        market: `${cryptoAssetBuyAndSell}/USD`,
        subaccount: "Main Account",
        side: "sell",
        price: 0.0977,
        type: "market",
        size: 3,
        reduceOnly: false,
      },
    ];
    ordersToPlace.forEach(order => binarySearchTree.insert(order.price));
    cache.set('binarySearchTree', binarySearchTree);
    cache.set("marketOrders", JSON.stringify(ordersToPlace));
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
