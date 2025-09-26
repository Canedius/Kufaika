import { server } from "./server.js";

const payload = {
  productId: 14,
  colorName: "\u041e\u043b\u0438\u0432\u0430",
  sizeLabel: "XL",
  sku: "KUF006OGXL",
  offerId: 4532
};

const listener = server.listen(0, async () => {
  const { port } = listener.address();
  const response = await fetch(`http://localhost:${port}/api/variants`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  console.log(JSON.stringify(data));
  listener.close();
});
