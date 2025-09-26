import { server } from "./server.js";

const listener = server.listen(0, async () => {
  const { port } = listener.address();
  const response = await fetch(`http://localhost:${port}/api/variants?productId=14`);
  const data = await response.json();
  console.log(JSON.stringify(data));
  listener.close();
});
