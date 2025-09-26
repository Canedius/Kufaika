import { server } from "./server.js";

const payload = {
  event: "order.change_order_status",
  context: {
    id: 123456,
    source_uuid: "test-source",
    global_source_uuid: "test-source",
    status_id: 10,
    status_group_id: 2,
    status_name: "Завершено",
    status_changed_at: new Date().toISOString(),
    items: [
      {
        sku: "KUF006OGXL",
        quantity: 2,
        price: 1450
      },
      {
        sku: "KUF007BKXS/S",
        quantity: 1,
        price: 1200
      }
    ]
  }
};

const listener = server.listen(0, async () => {
  const { port } = listener.address();
  const response = await fetch(`http://localhost:${port}/webhooks/keycrm/orders`, {
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
