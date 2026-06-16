import { Request, Response, NextFunction } from "express";

declare module "express-session" {
  interface SessionData {
    userId: number;
    role: string;
    username: string;
    displayName: string | null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId || !roles.includes(req.session.role ?? "")) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
