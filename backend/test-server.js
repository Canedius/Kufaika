import { server } from "./server.js";

const listener = server.listen(0, async () => {
  const { port } = listener.address();
  const response = await fetch(`http://localhost:${port}/api/sales`);
  const data = await response.json();
  console.log(JSON.stringify({ products: data.products.length }));
  listener.close();
});
