import { execSync } from "node:child_process";
const output = execSync('wrangler d1 execute hoodie-sales --remote --command "SELECT id, product_id, name FROM colors" --json', {encoding: 'utf8'});
const colors = JSON.parse(output)[0].results;
console.log(colors.filter(c => c.product_id === 8));