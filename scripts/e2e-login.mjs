import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const baseUrl = (process.env.E2E_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error("MONGODB_URI is required for the isolated login test.");
}

const suffix = crypto.randomBytes(8).toString("hex");
const email = `e2e-login-${suffix}@example.test`;
const password = crypto.randomBytes(24).toString("base64url");
const now = new Date();
const userId = new mongoose.Types.ObjectId();
const orgId = new mongoose.Types.ObjectId();
const memberId = new mongoose.Types.ObjectId();
const subscriptionId = new mongoose.Types.ObjectId();
const cookieJar = new Map();

function rememberCookies(response) {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  for (const setCookie of setCookies) {
    const pair = setCookie.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator > 0) cookieJar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader() {
  return [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  if (cookieJar.size) headers.set("cookie", cookieHeader());
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers, redirect: "manual" });
  rememberCookies(response);
  return response;
}

let db;
try {
  await mongoose.connect(mongoUri);
  db = mongoose.connection.db;

  const passwordHash = await bcrypt.hash(password, 12);
  await db.collection("users").insertOne({
    _id: userId,
    name: "E2E Login User",
    email,
    passwordHash,
    role: "user",
    isActive: true,
    sessionVersion: 0,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  });
  await db.collection("organizations").insertOne({
    _id: orgId,
    name: "E2E Login Workspace",
    ownerId: userId,
    status: "active",
    membershipVersion: 0,
    maxMembers: 3,
    createdAt: now,
    updatedAt: now,
  });
  await db.collection("organizationmembers").insertOne({
    _id: memberId,
    orgId,
    userId,
    role: "owner",
    invitedByUserId: null,
    createdAt: now,
    updatedAt: now,
  });
  await db.collection("subscriptions").insertOne({
    _id: subscriptionId,
    orgId,
    planKey: "free",
    status: "active",
    currentPeriodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    currentPeriodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    cancelAtPeriodEnd: false,
    provider: "manual",
    providerCustomerId: null,
    providerSubscriptionId: null,
    graceUntil: null,
    createdAt: now,
    updatedAt: now,
  });

  const loginPage = await request("/login");
  if (loginPage.status !== 200) throw new Error(`/login returned ${loginPage.status}.`);

  const csrfResponse = await request("/api/auth/csrf");
  if (csrfResponse.status !== 200) throw new Error(`/api/auth/csrf returned ${csrfResponse.status}.`);
  const { csrfToken } = await csrfResponse.json();
  if (!csrfToken) throw new Error("NextAuth did not return a CSRF token.");

  const form = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: `${baseUrl}/dashboard`,
    json: "true",
  });
  const callbackResponse = await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (callbackResponse.status !== 200) {
    throw new Error(`Credentials callback returned ${callbackResponse.status}.`);
  }
  if (![...cookieJar.keys()].some((name) => name.endsWith("aidl.session-token"))) {
    throw new Error("Login completed without issuing the AIDL session cookie.");
  }

  const sessionResponse = await request("/api/auth/session");
  const session = await sessionResponse.json();
  if (sessionResponse.status !== 200 || session?.user?.email !== email) {
    throw new Error("The authenticated session did not resolve to the test user.");
  }

  const dashboardResponse = await request("/dashboard");
  const dashboardHtml = await dashboardResponse.text();
  if (dashboardResponse.status !== 200) {
    throw new Error(`/dashboard returned ${dashboardResponse.status}.`);
  }
  const forbiddenMarkers = [
    "Attempted to call useI18n() from the server",
    "Something went wrong",
  ];
  const marker = forbiddenMarkers.find((value) => dashboardHtml.includes(value));
  if (marker) throw new Error(`/dashboard still contains the runtime error: ${marker}`);
  if (!dashboardHtml.includes("E2E Login Workspace")) {
    throw new Error("Dashboard rendered without the authenticated test workspace.");
  }

  console.log(
    JSON.stringify({
      ok: true,
      loginPage: loginPage.status,
      credentialsCallback: callbackResponse.status,
      session: sessionResponse.status,
      dashboard: dashboardResponse.status,
      authenticated: true,
      dashboardRendered: true,
    })
  );
} finally {
  if (db) {
    await Promise.allSettled([
      db.collection("auditlogs").deleteMany({ actorUserId: userId }),
      db.collection("subscriptions").deleteOne({ _id: subscriptionId }),
      db.collection("organizationmembers").deleteOne({ _id: memberId }),
      db.collection("organizations").deleteOne({ _id: orgId }),
      db.collection("users").deleteOne({ _id: userId }),
    ]);
  }
  await mongoose.disconnect();
}
