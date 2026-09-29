import { describe, expect, it } from "vitest"
import { buildOriginPolicy, withCorsPolicy } from "./cors.ts"

describe("buildOriginPolicy", () => {
  const policy = buildOriginPolicy("https://lexalens.app/", "https://staging.example.com, https://*-team.vercel.app")

  it("allows APP_URL and its www twin, ignoring case and trailing slash", () => {
    expect(policy.isAllowed("https://lexalens.app")).toBe(true)
    expect(policy.isAllowed("https://www.lexalens.app")).toBe(true)
    expect(policy.isAllowed("HTTPS://LexaLens.app/")).toBe(true)
  })

  it("allows ALLOWED_ORIGINS entries, including one-label wildcards", () => {
    expect(policy.isAllowed("https://staging.example.com")).toBe(true)
    expect(policy.isAllowed("https://lexalens-git-main-team.vercel.app")).toBe(true)
    expect(policy.isAllowed("https://evil.com/x-team.vercel.app")).toBe(false)
    expect(policy.isAllowed("https://a.b-team.vercel.app")).toBe(false)
  })

  it("always allows localhost for local dev", () => {
    expect(policy.isAllowed("http://localhost:5173")).toBe(true)
    expect(policy.isAllowed("http://127.0.0.1:4173")).toBe(true)
  })

  it("rejects other origins and lookalikes", () => {
    expect(policy.isAllowed("https://evil.com")).toBe(false)
    expect(policy.isAllowed("https://lexalens.app.evil.com")).toBe(false)
    expect(policy.isAllowed("http://lexalens.app")).toBe(false)
    expect(policy.isAllowed("http://localhost.evil.com")).toBe(false)
  })

  it("allows everything when nothing is configured", () => {
    const open = buildOriginPolicy(undefined, "")
    expect(open.allowAll).toBe(true)
    expect(open.isAllowed("https://anything.example")).toBe(true)
  })
})

describe("withCorsPolicy", () => {
  const policy = buildOriginPolicy("https://lexalens.app", undefined)
  let calls = 0
  const handler = withCorsPolicy(
    () => {
      calls++
      return new Response("ok", { status: 201, headers: { "Content-Type": "text/plain" } })
    },
    () => policy,
  )

  it("echoes an allowed origin and keeps the handler's response", async () => {
    const res = await handler(new Request("https://fn.test", { method: "POST", headers: { Origin: "https://lexalens.app" } }))
    expect(res.status).toBe(201)
    expect(await res.text()).toBe("ok")
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://lexalens.app")
    expect(res.headers.get("Content-Type")).toBe("text/plain")
    expect(res.headers.get("Vary")).toContain("Origin")
  })

  it("refuses a disallowed origin without running the handler", async () => {
    calls = 0
    const res = await handler(new Request("https://fn.test", { method: "POST", headers: { Origin: "https://evil.com" } }))
    expect(res.status).toBe(403)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull()
    expect(calls).toBe(0)
  })

  it("answers preflight itself", async () => {
    calls = 0
    const res = await handler(new Request("https://fn.test", { method: "OPTIONS", headers: { Origin: "http://localhost:5173" } }))
    expect(res.status).toBe(200)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173")
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("authorization")
    expect(calls).toBe(0)
  })

  it("passes through requests with no Origin (server-to-server) without an allow-origin header", async () => {
    const res = await handler(new Request("https://fn.test", { method: "POST" }))
    expect(res.status).toBe(201)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull()
  })
})
