import { Router, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Pool } from "pg";
import type { AuthUser } from "@shared/schema";
import dotenv from "dotenv";
import nodeFetch from "node-fetch";

dotenv.config();

const EXTERNAL_API_URL = process.env.API_BASE_URL || "https://pima.sci.ce.gatech.edu";

// Extend Express Session type with all user info
declare module "express-session" {
  interface SessionData {
    userId?: string;
    email?: string;
    name?: string;
    organizationId?: string;
    organizationName?: string;
    isAdmin?: boolean;
    isOrgOwner?: boolean;
  }
}

// Create session store
const PgSessionStore = connectPgSimple(session);

export function createSessionMiddleware(pool: Pool) {
  const sessionSecret = process.env.SESSION_SECRET || "change-me-in-production";
  const store = new PgSessionStore({
    pool,
    tableName: "session",
    createTableIfMissing: true,
  });

  const isProduction = process.env.NODE_ENV === "production";

  console.log("[Session] Configuration:", {
    isProduction,
    secure: isProduction,
    hasSecret: !!sessionSecret,
    secretLength: sessionSecret.length,
  });

  return session({
    store,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
      domain: process.env.COOKIE_DOMAIN,
    },
    name: "sessionId",
    rolling: true,
  });
}

// Auth middleware to protect routes
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

// Create auth routes
export function createAuthRoutes(): Router {
  const router = Router();

  /**
   * GET /api/auth/me
   * Returns current user from session (no DB query)
   */
  router.get("/me", (req: Request, res: Response) => {
    console.log("[/api/auth/me] Request received");
    console.log("[/api/auth/me] Session ID:", req.sessionID);
    console.log("[/api/auth/me] Session userId:", req.session?.userId);
    console.log("[/api/auth/me] Session keys:", Object.keys(req.session || {}));

    if (!req.session?.userId) {
      console.log("[/api/auth/me] No user in session - returning 401");
      return res.status(401).json({ message: "Not authenticated" });
    }

    console.log("[/api/auth/me] User found:", req.session.email);
    res.json({
      user: {
        id: req.session.userId,
        email: req.session.email!,
        name: req.session.name!,
        organizationId: req.session.organizationId!,
        organizationName: req.session.organizationName!,
        isAdmin: req.session.isAdmin!,
        isOrgOwner: req.session.isOrgOwner!,
      }
    });
  });

  /**
   * POST /api/auth/callback
   * Login with credentials → calls external API
   * This is the ONLY route that contacts the external API
   */
  router.post("/callback", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      console.log("[/api/auth/callback] Login attempt for:", email);

      // Basic validation
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      // Flask expects form-urlencoded, not JSON
      const params = new URLSearchParams();
      params.append("email", email);
      params.append("password", password);

      // 1. Authenticate via external API (Flask expects form-urlencoded)
      const loginResponse = await nodeFetch(`${EXTERNAL_API_URL}/login`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString(),
        redirect: "manual", // Flask does 302 redirects
      });

      console.log("[/api/auth/callback] Login response status:", loginResponse.status);

      // 2. Get external API session cookie
      const setCookieHeader = loginResponse.headers.get("set-cookie");
      console.log("[/api/auth/callback] Set-Cookie:", setCookieHeader);

      if (!setCookieHeader) {
        // Login failed - no cookie received
        console.log("[/api/auth/callback] Login failed - no cookie received");
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Parse the cookie (probably "session=...")
      const externalCookie = setCookieHeader.split(";")[0].trim();
      console.log("[/api/auth/callback] External cookie:", externalCookie);

      // 3. Fetch user info from external API
      const meResponse = await nodeFetch(`${EXTERNAL_API_URL}/api/me`, {
        headers: { 
          Cookie: externalCookie
        },
      });

      console.log("[/api/auth/callback] /api/me response status:", meResponse.status);

      if (!meResponse.ok) {
        console.log("[/api/auth/callback] Failed to fetch user data");
        return res.status(500).json({ message: "Failed to fetch user data" });
      }

      // Check content-type is JSON
      const contentType = meResponse.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        const text = await meResponse.text();
        console.log("[/api/auth/callback] Expected JSON, got:", contentType);
        console.log("[/api/auth/callback] Response:", text.substring(0, 300));
        return res.status(500).json({ message: "Invalid response from external API" });
      }

      const userData: any = await meResponse.json();
      console.log("[/api/auth/callback] User data:", { id: userData.id, email: userData.email });

      // 4. Store EVERYTHING in local session (no DB)
      req.session.userId = userData.id;
      req.session.email = userData.email;
      req.session.name = userData.name;
      req.session.organizationId = userData.organization_id;
      req.session.organizationName = userData.organization_name;
      req.session.isAdmin = userData.is_admin || false;
      req.session.isOrgOwner = userData.is_org_owner || false;

      // 5. Save and return
      req.session.save((err) => {
        if (err) {
          console.error("[/api/auth/callback] Session save error:", err);
          return res.status(500).json({ message: "Session creation failed" });
        }

        console.log("[/api/auth/callback] Session saved successfully");
        console.log("[/api/auth/callback] Session ID:", req.sessionID);
        console.log("[/api/auth/callback] Session cookies set:", res.getHeader("set-cookie") ? "YES" : "NO");

        console.log("[/api/auth/callback] Login successful for:", userData.email);
        res.json({
          user: {
            id: userData.id,
            email: userData.email,
            name: userData.name,
            organizationId: userData.organization_id,
            organizationName: userData.organization_name,
            isAdmin: userData.is_admin,
            isOrgOwner: userData.is_org_owner,
          }
        });
      });

    } catch (error) {
      console.error("[/api/auth/callback] Authentication error:", error);
      res.status(500).json({ message: "Authentication server error" });
    }
  });

  /**
   * POST /api/auth/logout
   * Destroy session
   */
  router.post("/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  return router;
}
