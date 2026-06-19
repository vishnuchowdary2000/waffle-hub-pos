import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

export async function seedDefaultUsers(): Promise<void> {
  try {
    const existing = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    if (existing.length > 0) return;

    const defaults = [
      { username: "admin", password: "admin123", role: "admin", displayName: "Admin" },
      { username: "counter", password: "counter123", role: "counter", displayName: "Counter Staff" },
      { username: "kitchen", password: "kitchen123", role: "kitchen", displayName: "Kitchen Staff" },
    ];

    for (const u of defaults) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      await db.insert(usersTable).values({
        username: u.username,
        passwordHash,
        role: u.role,
        displayName: u.displayName,
      });
    }
    logger.info("Default users seeded");
  } catch (err) {
    logger.error({ err }, "Failed to seed default users");
  }
}

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username.trim()))
    .limit(1);

  if (!user || !user.active) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.username = user.username;
  req.session.displayName = user.displayName ?? null;

  req.session.save((err) => {
    if (err) {
      logger.error({ err }, "Session save failed during login");
      res.status(500).json({ error: "Login failed. Please try again." });
      return;
    }
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName ?? null,
    });
  });
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/auth/me", (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role,
    displayName: req.session.displayName ?? null,
  });
});

export default router;
