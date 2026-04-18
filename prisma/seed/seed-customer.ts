import bcrypt from "bcryptjs";
import { prisma } from "../../src/config/prisma.js";

const CUSTOMERS = [
	{ email: "customer1@example.com", password: "12345678", phone: "01700000001" },
	{ email: "customer2@example.com", password: "12345678", phone: "01700000002" },
	{ email: "customer3@example.com", password: "12345678", phone: "01700000003" },
	{ email: "customer4@example.com", password: "12345678", phone: "01700000004" },
	{ email: "customer5@example.com", password: "12345678", phone: "01700000005" },
	{ email: "customer6@example.com", password: "12345678", phone: "01700000006" }
];

async function main() {
	for (const item of CUSTOMERS) {
		const existing = await prisma.user.findUnique({ where: { email: item.email } });
		if (existing) {
			console.log(`customer already exists (${item.email}), skipping`);
			continue;
		}

		const hashed = await bcrypt.hash(item.password, 12);
		const user = await prisma.user.create({
			data: {
				email: item.email,
				password: hashed,
				role: "CUSTOMER",
				verified: true
			}
		});

		const customer = await prisma.customer.create({
			data: {
				userId: user.id,
				image: null,
				phone: item.phone,
				status: "ACTIVE"
			}
		});

		await prisma.wishlist.create({ data: { customerId: customer.id } });

		console.log(`created customer: ${item.email}`);
	}
}

main()
	.catch((err) => {
		console.error("seed error", err);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
