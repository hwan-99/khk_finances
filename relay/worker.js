// Finance Manager — Korean stock price relay (Cloudflare Worker).
//
// Naver Finance serves KRX prices but refuses browser requests from other sites (CORS), so the app can't
// call it directly. This Worker calls it server-side and hands the prices back to the app only.
//
//   GET /?codes=005930,000660,292150   →   {"005930":{"price":193500,"at":"2026-11-06T20:00:00+09:00","open":false}, ...}
//
// price = KRX price (live during the session, the close after it); NXT after-hours trades are ignored.
// Deploy: dash.cloudflare.com → Workers & Pages → Create → "Hello World" Worker → Edit code → paste this file → Deploy.

const ALLOWED_ORIGIN = "https://hwan-99.github.io";
const NAVER = "https://polling.finance.naver.com/api/realtime/domestic/stock/";

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const cors = { "Access-Control-Allow-Origin": ALLOWED_ORIGIN, "Vary": "Origin" };
    if (origin !== ALLOWED_ORIGIN) return new Response("forbidden", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET" } });

    const codes = [...new Set((new URL(request.url).searchParams.get("codes") || "").toUpperCase().split(","))]
      .filter((c) => /^[0-9A-Z]{6}$/.test(c))
      .slice(0, 50);
    if (!codes.length) return Response.json({ error: "pass ?codes=005930,000660" }, { status: 400, headers: cors });

    let r;
    try {
      r = await fetch(NAVER + codes.join(","), { headers: { "User-Agent": "Mozilla/5.0" } });
    } catch (e) {
      return Response.json({ error: "naver unreachable" }, { status: 502, headers: cors });
    }
    if (!r.ok) return Response.json({ error: "naver " + r.status }, { status: 502, headers: cors });

    const out = {};
    for (const d of (await r.json()).datas || []) {
      const price = Number(d.closePriceRaw ?? String(d.closePrice || "").replace(/,/g, ""));
      if (d.itemCode && price > 0) out[d.itemCode] = { price, at: d.localTradedAt || "", open: d.marketStatus === "OPEN" };
    }
    return Response.json(out, { headers: { ...cors, "Cache-Control": "max-age=15" } });
  },
};
