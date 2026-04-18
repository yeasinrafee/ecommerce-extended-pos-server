import bcrypt from "bcryptjs";
import { prisma } from "../../src/config/prisma.js";

const EMAIL = process.env.SUPERADMIN_EMAIL || "superadmin@gmail.com";
const PASSWORD = process.env.SUPERADMIN_PASSWORD || "12345678";
const NAME = process.env.SUPERADMIN_NAME || "Super Admin";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.log(`superadmin already exists (${EMAIL}), skipping seed`);
    return;
  }

  const hashed = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      password: hashed,
      role: "SUPER_ADMIN",
      verified: true,
    },
  });

  await prisma.admin.create({
    data: {
      userId: user.id,
      name: NAME,
      image: null,
      status: "ACTIVE",
    },
  });

  console.log(`created superadmin: ${EMAIL}`);
}

main()
  .catch((err) => {
    console.error("seed error", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
