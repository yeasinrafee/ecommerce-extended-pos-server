import { prisma } from "../../src/config/prisma.js";

async function main() {
  console.log("Starting notification seed...");

  const notifications = [
    { title: "New Order Placed", message: "Order #1024 has been placed by John Doe." },
    { title: "Payment Received", message: "Payment for Order #1024 was successful." },
    { title: "Order Cancelled", message: "Order #1021 has been cancelled by the customer." },
    { title: "Stock Alert", message: "Product 'Smartphone X' is running low on stock (5 remaining)." },
    { title: "New Review", message: "A new 5-star review was left for 'Wireless Earbuds'." },
    { title: "New Customer Registered", message: "Jane Smith has created a new account." },
    { title: "Promo Code Used", message: "Customer used 'WELCOME20' on their first order." },
    { title: "Refund Requested", message: "A refund request was submitted for Order #1015." },
    { title: "System Update", message: "The dashboard will undergo maintenance tonight at 12 AM." },
    { title: "Withdrawal Successful", message: "Bulk payout of $5,000 processed." },
    { title: "Brand Approved", message: "New brand 'TechStyle' has been approved." },
    { title: "Category Updated", message: "The 'Electronics' category was updated by an admin." },
    { title: "Shipping Label Generated", message: "Shipping label for Order #1025 is ready." },
    { title: "Order Shipped", message: "Order #1020 has been marked as shipped." },
    { title: "Delivery Success", message: "Order #1018 was delivered successfully." },
    { title: "Failed Login Attempt", message: "Multiple failed login attempts detected for admin@example.com." },
    { title: "New Support Ticket", message: "A new support ticket #4521 was opened." },
    { title: "Marketing Campaign Started", message: "The 'Spring Sale' campaign is now live." },
    { title: "Bulk Edit Complete", message: "Price updates for 50 products finished successfully." },
    { title: "Database Backup", message: "Weekly database backup completed successfully." },
  ];

  for (let i = 0; i < notifications.length; i++) {
    const data = notifications[i];
    
    // Distribute notifications across the last 30 days
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - (i % 30));
    createdAt.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));

    await prisma.notification.create({
      data: {
        title: data.title,
        message: data.message,
        createdAt: createdAt,
        updatedAt: createdAt,
      },
    });
  }

  console.log(`Seed completed. Created ${notifications.length} notifications.`);
}

main()
  .catch((err) => {
    console.error("Notification seed error", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
