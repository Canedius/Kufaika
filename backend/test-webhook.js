import { server } from "./server.js";

const payload = {
  offer_id: 4532,
  sku: "KUF006OGXL",
  in_stock: 28,
  in_reserve: 5
};

const listener = server.listen(0, async () => {
  const { port } = listener.address();
  const response = await fetch(`http://localhost:${port}/webhooks/keycrm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "keycrm-webhook": "stocks"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  console.log(JSON.stringify(data));
  listener.close();
});
