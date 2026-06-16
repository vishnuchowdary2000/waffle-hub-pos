import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middleware/auth";

const router = Router();

router.get("/users", requireRole("admin"), async (req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      displayName: usersTable.displayName,
      active: usersTable.active,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);

  res.json(
    users.map(u => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
    }))
  );
});

router.post("/users", requireRole("admin"), async (req, res) => {
  const { username, password, role, displayName } = req.body as {
    username?: string;
    password?: string;
    role?: string;
    displayName?: string;
  };

  if (!username || !password || !role) {
    res.status(400).json({ error: "username, password, and role are required" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ username, passwordHash, role, displayName: displayName ?? null })
    .returning();

  res.status(201).json({
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.displayName ?? null,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
  });
});

router.patch("/users/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { username, password, role, displayName, active } = req.body as {
    username?: string;
    password?: string;
    role?: string;
    displayName?: string | null;
    active?: boolean;
  };

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (username !== undefined) updates.username = username;
  if (role !== undefined) updates.role = role;
  if (displayName !== undefined) updates.displayName = displayName;
  if (active !== undefined) updates.active = active;
  if (password) updates.passwordHash = await bcrypt.hash(password, 10);

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.displayName ?? null,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
  });
});

router.delete("/users/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  if (id === req.session.userId) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.status(204).end();
});

export default router;
