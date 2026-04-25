const bcrypt = require("bcryptjs");

async function main() {
  const hash = await bcrypt.hash("admin123", 10);
  console.log(hash);
}

main();