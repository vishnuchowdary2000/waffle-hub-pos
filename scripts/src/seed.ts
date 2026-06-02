import { db, categoriesTable, productsTable } from "@workspace/db";

async function seed() {
  console.log("Seeding database...");

  // Categories
  const [classics, specialty, beverages, sides, combos] = await db
    .insert(categoriesTable)
    .values([
      { name: "Classic Waffles", displayOrder: 1, active: true },
      { name: "Specialty Waffles", displayOrder: 2, active: true },
      { name: "Beverages", displayOrder: 3, active: true },
      { name: "Sides & Add-ons", displayOrder: 4, active: true },
      { name: "Combos", displayOrder: 5, active: true },
    ])
    .onConflictDoNothing()
    .returning();

  console.log("Categories seeded.");

  if (!classics) {
    console.log("Categories already exist, skipping products.");
    process.exit(0);
  }

  await db.insert(productsTable).values([
    // Classic Waffles
    { name: "Plain Waffle", categoryId: classics.id, price: 60, description: "Crispy golden waffle", active: true },
    { name: "Butter Waffle", categoryId: classics.id, price: 70, description: "With fresh butter", active: true },
    { name: "Honey Waffle", categoryId: classics.id, price: 80, description: "Drizzled with honey", active: true },
    { name: "Jam Waffle", categoryId: classics.id, price: 80, description: "Strawberry / mixed fruit jam", active: true },
    { name: "Maple Syrup Waffle", categoryId: classics.id, price: 90, description: "Classic maple syrup drizzle", active: true },

    // Specialty Waffles
    { name: "Chocolate Waffle", categoryId: specialty.id, price: 100, description: "Rich chocolate sauce", active: true },
    { name: "Nutella Waffle", categoryId: specialty.id, price: 110, description: "Creamy Nutella spread", active: true },
    { name: "Fruit & Cream Waffle", categoryId: specialty.id, price: 130, description: "Fresh fruits with whipped cream", active: true },
    { name: "Cheese Waffle", categoryId: specialty.id, price: 120, description: "Savory melted cheese", active: true },
    { name: "Peanut Butter Waffle", categoryId: specialty.id, price: 110, description: "Creamy peanut butter", active: true },
    { name: "Lotus Biscoff Waffle", categoryId: specialty.id, price: 130, description: "Cookie butter spread", active: true },
    { name: "S'mores Waffle", categoryId: specialty.id, price: 140, description: "Chocolate, marshmallow, graham", active: true },

    // Beverages
    { name: "Hot Chocolate", categoryId: beverages.id, price: 60, description: "Rich creamy hot chocolate", active: true },
    { name: "Masala Chai", categoryId: beverages.id, price: 30, description: "Spiced Indian tea", active: true },
    { name: "Cold Coffee", categoryId: beverages.id, price: 70, description: "Blended iced coffee", active: true },
    { name: "Milkshake - Chocolate", categoryId: beverages.id, price: 90, description: "", active: true },
    { name: "Milkshake - Strawberry", categoryId: beverages.id, price: 90, description: "", active: true },
    { name: "Fresh Lime Soda", categoryId: beverages.id, price: 50, description: "Sweet / salted", active: true },
    { name: "Mineral Water", categoryId: beverages.id, price: 20, description: "", active: true },

    // Sides
    { name: "Extra Whipped Cream", categoryId: sides.id, price: 20, description: "", active: true },
    { name: "Extra Chocolate Sauce", categoryId: sides.id, price: 20, description: "", active: true },
    { name: "Scoop of Ice Cream", categoryId: sides.id, price: 40, description: "Vanilla / chocolate / strawberry", active: true },
    { name: "Fresh Fruit Bowl", categoryId: sides.id, price: 60, description: "Seasonal mixed fruits", active: true },
    { name: "Waffle Stick x4", categoryId: sides.id, price: 50, description: "Crispy mini waffle sticks", active: true },

    // Combos
    { name: "Waffle + Cold Coffee", categoryId: combos.id, price: 120, description: "Any classic waffle + cold coffee", active: true },
    { name: "Waffle + Hot Choc", categoryId: combos.id, price: 110, description: "Any classic waffle + hot chocolate", active: true },
    { name: "Family Pack (4 Waffles)", categoryId: combos.id, price: 280, description: "4 classic waffles + 4 beverages", active: true },
    { name: "Date Night Combo", categoryId: combos.id, price: 250, description: "2 specialty waffles + 2 hot chocs", active: true },
  ]).onConflictDoNothing();

  console.log("Products seeded.");
  console.log("Done! Database seeded successfully.");
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
