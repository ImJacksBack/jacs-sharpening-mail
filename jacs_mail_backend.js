const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 8787);
const GMAIL_TO = "ImJacksBack@gmail.com";

function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(payload);
}

function normaliseSpaces(v) {
  return String(v || "").replace(/\s{2,}/g, " ").trim();
}

function ensureFields(data) {
  const required = ["customerName", "mobile", "email", "acceptedBy", "acceptedAt", "termsVersion"];
  for (const k of required) {
    if (!normaliseSpaces(data[k])) {
      throw new Error(`Missing required field: ${k}`);
    }
  }
}

function buildCompletedFormText(data) {
  return `Jac's Sharpening - Completed Customer Acceptance Form

Customer details
Customer name: ${normaliseSpaces(data.customerName)}
Mobile: ${normaliseSpaces(data.mobile)}
Email: ${normaliseSpaces(data.email)}
Street address: ${normaliseSpaces(data.streetAddress) || "Not supplied"}
Suburb: ${normaliseSpaces(data.suburb) || "Not supplied"}
Postcode: ${normaliseSpaces(data.postcode) || "Not supplied"}

Terms acceptance
Terms accepted: Yes
Accepted by: ${normaliseSpaces(data.acceptedBy)}
Accepted at: ${normaliseSpaces(data.acceptedAt)}
Terms version: ${normaliseSpaces(data.termsVersion)}`;
}

function escHtml(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildCompletedFormHtml(data) {
  const customerName = escHtml(normaliseSpaces(data.customerName));
  const mobile = escHtml(normaliseSpaces(data.mobile));
  const email = escHtml(normaliseSpaces(data.email));
  const streetAddress = escHtml(normaliseSpaces(data.streetAddress) || "Not supplied");
  const suburb = escHtml(normaliseSpaces(data.suburb) || "Not supplied");
  const postcode = escHtml(normaliseSpaces(data.postcode) || "Not supplied");
  const acceptedBy = escHtml(normaliseSpaces(data.acceptedBy));
  const acceptedAt = escHtml(normaliseSpaces(data.acceptedAt));
  const termsVersion = escHtml(normaliseSpaces(data.termsVersion));

  return `
<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:12pt;color:#1f1f1f;line-height:1.5;">
  <p>Jac's Sharpening - Completed Customer Acceptance Form</p>
  <h3 style="margin:14px 0 8px;">Customer details</h3>
  <table style="border-collapse:collapse;min-width:620px;">
    <tr><td style="border:1px solid #222;padding:6px 10px;min-width:220px;">Customer name:</td><td style="border:1px solid #222;padding:6px 10px;">${customerName}</td></tr>
    <tr><td style="border:1px solid #222;padding:6px 10px;">Mobile:</td><td style="border:1px solid #222;padding:6px 10px;">${mobile}</td></tr>
    <tr><td style="border:1px solid #222;padding:6px 10px;">Email:</td><td style="border:1px solid #222;padding:6px 10px;">${email}</td></tr>
    <tr><td style="border:1px solid #222;padding:6px 10px;">Street address:</td><td style="border:1px solid #222;padding:6px 10px;">${streetAddress}</td></tr>
    <tr><td style="border:1px solid #222;padding:6px 10px;">Suburb:</td><td style="border:1px solid #222;padding:6px 10px;">${suburb}</td></tr>
    <tr><td style="border:1px solid #222;padding:6px 10px;">Postcode:</td><td style="border:1px solid #222;padding:6px 10px;">${postcode}</td></tr>
  </table>
  <h3 style="margin:16px 0 8px;">Terms acceptance</h3>
  <table style="border-collapse:collapse;min-width:620px;">
    <tr><td style="border:1px solid #222;padding:6px 10px;min-width:220px;">Terms accepted:</td><td style="border:1px solid #222;padding:6px 10px;">Yes</td></tr>
    <tr><td style="border:1px solid #222;padding:6px 10px;">Accepted by:</td><td style="border:1px solid #222;padding:6px 10px;">${acceptedBy}</td></tr>
    <tr><td style="border:1px solid #222;padding:6px 10px;">Accepted at:</td><td style="border:1px solid #222;padding:6px 10px;">${acceptedAt}</td></tr>
    <tr><td style="border:1px solid #222;padding:6px 10px;">Terms version:</td><td style="border:1px solid #222;padding:6px 10px;">${termsVersion}</td></tr>
  </table>
</div>`;
}

function buildCustomerBody(data) {
  return `Hello ${normaliseSpaces(data.customerName)},

Thank you. Please find below a copy of your completed Jac's Sharpening customer acceptance form.

${buildCompletedFormText(data)}

Regards,
Jac's Sharpening`;
}

function buildBusinessBody(data) {
  return `Completed form:

${buildCompletedFormText(data)}

JSON file attached: jacs-customer-form.json`;
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildMimeText({ to, from, subject, body }) {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body
  ].join("\r\n");
}

function buildMimeHtml({ to, from, subject, textFallback, htmlBody }) {
  const boundary = "----=_Alt_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    textFallback,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    htmlBody,
    "",
    `--${boundary}--`,
    ""
  ].join("\r\n");
}

function buildMimeWithJsonAttachment({ to, from, subject, textBody, htmlBody, jsonAttachment }) {
  const boundary = "----=_Part_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
  const altBoundary = "----=_Alt_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    textBody,
    "",
    `--${altBoundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    htmlBody,
    "",
    `--${altBoundary}--`,
    "",
    `--${boundary}`,
    "Content-Type: application/json; name=\"jacs-customer-form.json\"",
    "Content-Transfer-Encoding: base64",
    "Content-Disposition: attachment; filename=\"jacs-customer-form.json\"",
    "",
    Buffer.from(jsonAttachment, "utf8").toString("base64"),
    "",
    `--${boundary}--`,
    ""
  ].join("\r\n");
}

async function getAccessToken() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Gmail OAuth env vars. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.");
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`Token request failed: ${tokenRes.status} ${t}`);
  }
  const tokenJson = await tokenRes.json();
  return tokenJson.access_token;
}

async function gmailSendRaw(accessToken, raw) {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw: base64url(raw) })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gmail send failed: ${res.status} ${t}`);
  }
  return res.json();
}

async function sendBothEmails(data) {
  ensureFields(data);
  const fromAddress = process.env.GMAIL_FROM_ADDRESS || "ImJacksBack@gmail.com";
  const accessToken = await getAccessToken();

  const customerHtml = `<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:12pt;color:#1f1f1f;line-height:1.5;">
<p>Hello ${escHtml(normaliseSpaces(data.customerName))},</p>
<p>Thank you. Please find below a copy of your completed Jac's Sharpening customer acceptance form.</p>
${buildCompletedFormHtml(data)}
<p style="margin-top:14px;">Regards,<br/>Jac's Sharpening</p>
</div>`;
  const customerMime = buildMimeHtml({
    from: fromAddress,
    to: normaliseSpaces(data.email),
    subject: `Jac's Sharpening completed customer form - ${normaliseSpaces(data.customerName)}`,
    textFallback: buildCustomerBody(data),
    htmlBody: customerHtml
  });
  const customerResult = await gmailSendRaw(accessToken, customerMime);

  const businessHtml = `<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:12pt;color:#1f1f1f;line-height:1.5;">
<p><strong>Completed form:</strong></p>
${buildCompletedFormHtml(data)}
<p style="margin-top:14px;"><strong>JSON file attached:</strong> jacs-customer-form.json</p>
</div>`;
  const businessMime = buildMimeWithJsonAttachment({
    from: fromAddress,
    to: GMAIL_TO,
    subject: `Jac's Sharpening customer form and JSON - ${normaliseSpaces(data.customerName)}`,
    textBody: buildBusinessBody(data),
    htmlBody: businessHtml,
    jsonAttachment: JSON.stringify(data, null, 2)
  });
  const businessResult = await gmailSendRaw(accessToken, businessMime);
  return { customerResult, businessResult };
}

loadDotEnv();

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "OPTIONS") return json(res, 204, {});

    if (req.method === "GET" && reqUrl.pathname === "/health") {
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && reqUrl.pathname === "/send-emails") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body || "{}");
      const result = await sendBothEmails(data);
      return json(res, 200, { ok: true, result });
    }

    return json(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    return json(res, 500, { ok: false, error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`Jac's mail backend running on http://localhost:${PORT}`);
});
