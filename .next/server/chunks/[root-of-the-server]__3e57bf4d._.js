module.exports=[93695,(e,r,t)=>{r.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},70406,(e,r,t)=>{r.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},18622,(e,r,t)=>{r.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,r,t)=>{r.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,r,t)=>{r.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},24725,(e,r,t)=>{r.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},59539,e=>{"use strict";e.s(["ADJUSTMENTS",0,{bedroom:{under200k:1e4,mid:15e3,over400k:25e3},bathroom:1e4,garage:1e4,carport:5e3,pool:1e4,traffic:{under500k:{siding:1e4,backing:1e4,fronting:15e3},over500k:{siding:.1,backing:.15,fronting:.2}}},"COMP_RULES",0,{maxAge:180,agingThreshold:150,agingWarningThreshold:120,agingPenalty:.05,maxSqftDifference:250,maxYearBuiltDifference:10,maxLotSqftDifference:2500,basementGuestHouseMultiplier:.5,maoMultiplier:.7}])},12554,e=>{"use strict";async function r(e){let r=process.env.ANTHROPIC_API_KEY?.trim();if(!r)throw Error("ANTHROPIC_API_KEY not configured");let t=new AbortController,a=setTimeout(()=>t.abort(),6e4);try{let a=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":r,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-5-20250929",max_tokens:16e3,system:'You are a real estate data lookup assistant. You MUST respond with ONLY valid JSON — no explanations, no markdown, no prose. If you cannot find exact data, use your best estimates based on what you find. Never say "I could not find" — always return the requested JSON structure with your best available data.',tools:[{type:"web_search_20250305",name:"web_search",max_uses:5}],messages:[{role:"user",content:e}]}),signal:t.signal});if(!a.ok){let e=await a.text();throw console.error("[DealUW] Anthropic API error:",a.status,e),Error(`Anthropic API error ${a.status}: ${e}`)}let s=await a.json();console.log("[DealUW] Response blocks:",s.content?.map(e=>e.type));let o=s.content.filter(e=>"text"===e.type).map(e=>e.text??"").join("\n");console.log("[DealUW] Text length:",o.length,"preview:",o.substring(0,300));let n=function(e){if(!e)return null;try{return JSON.parse(e)}catch{}let r=e.trim();if(r.startsWith("```")){r=r.replace(/^```(?:json)?\s*\n?/,"").replace(/\n?\s*```\s*$/,"");try{return JSON.parse(r)}catch{}}let t=r.match(/\[[\s\S]*\]/);if(t)try{return JSON.parse(t[0])}catch{}let a=r.match(/\{[\s\S]*\}/);if(a)try{return JSON.parse(a[0])}catch{}return null}(o);return console.log("[DealUW] Parsed:",n?"success":"null"),{text:o,parsed:n}}finally{clearTimeout(a)}}async function t(e,t,a,s){let o=`Search for property details for ${e}, ${t}, ${a} ${s}.

Look up this property on Zillow, Realtor.com, Redfin, or county tax records.
Find: bedrooms, bathrooms, square footage, lot size, year built, property type,
whether it has a pool, garage, basement, the tax assessed value, last sale
price and date, subdivision name, and estimated monthly rent.

Return ONLY a JSON object in this exact format, no other text:
{
  "beds": number,
  "baths": number,
  "sqft": number,
  "lot_sqft": number,
  "year_built": number,
  "property_type": "ranch or 2-story or split-level or historic or condo or townhouse or multi",
  "has_pool": true/false,
  "has_garage": true/false,
  "garage_count": number,
  "has_basement": true/false,
  "basement_sqft": number or 0,
  "tax_assessed_value": number,
  "last_sale_price": number or null,
  "last_sale_date": "YYYY-MM-DD" or null,
  "subdivision": "name or unknown",
  "estimated_rent": number or null,
  "zestimate": number or null
}`,{text:n,parsed:l}=await r(o);return l||console.error("[DealUW] researchProperty: failed to parse. Raw text:",n.substring(0,500)),l}function a(e){if(Array.isArray(e)&&e.length>0)return e;if(e&&"object"==typeof e&&!Array.isArray(e)){let r=e.comps||e.results||e.comparables||e.sales||e.data;if(Array.isArray(r)&&r.length>0)return r}return[]}async function s(e,t,s,o,n){let l=Number(n.sqft)||2e3,i=n.property_type??"single family",u=n.year_built??"unknown",d=n.lot_sqft??6e3,c=Math.round(.85*l),p=Math.round(1.15*l),h=new Date(Date.now()-15552e6).toISOString().slice(0,10),m=`[
  {
    "address": "street address",
    "sale_price": dollar amount as number,
    "sale_date": "YYYY-MM-DD",
    "sqft": number,
    "lot_sqft": number or ${d},
    "beds": number,
    "baths": number,
    "year_built": number,
    "property_type": "type",
    "distance_miles": estimated distance as number,
    "same_subdivision": true or false,
    "has_pool": false,
    "has_garage": true or false,
    "source": "zillow or redfin"
  }
]`,y=`Search for recently sold homes near ${e}, ${t}, ${s} ${o}.

I need comparable sales for a property that is ${l} sqft, ${i} style, built in ${u}, on a ${d} sqft lot.

Search Zillow for "recently sold homes ${t} ${s} ${o}" and Redfin for "sold homes near ${e} ${t} ${s}".

Find 5-10 homes that:
- Sold in the last 6 months (since ${h})
- Are within 1 mile of the subject
- Are between ${c} and ${p} sqft
- Are a similar style home

For EACH home you find, return this data. Return ONLY a JSON array:
${m}

If you cannot find exact matches, broaden your search to the full ${o} zip code. Return whatever sold homes you CAN find — some data is better than none. Do NOT return an empty array unless you truly found nothing.`;console.log("[DealUW] Searching for comps:",e,t,s,o);let{text:f,parsed:g}=await r(y);console.log("[DealUW] Primary search result:",g?`${Array.isArray(g)?g.length:"object"} items`:"null","raw length:",f.length);let b=a(g);if(b.length<3){console.log(`[DealUW] Only ${b.length} comps from primary search, running broader fallback`);let e=`Search for recently sold homes in zip code ${o||"near "+t+" "+s}.

Search Zillow for "recently sold homes ${o||t+" "+s}" and Redfin for "sold homes ${o||t+" "+s}".

I need at least 5 comparable sales. Homes that sold in the last 12 months. Similar to ${l} sqft, ${i} style.
If you can't find exact matches, include any recently sold homes nearby.

Find at least 5, up to 10. Return ONLY a JSON array:
${m}

You MUST return at least 3 results. Broaden your search area if needed. Do NOT return an empty array.`,n=a((await r(e)).parsed);console.log("[DealUW] Fallback result:",n.length,"comps");let u=new Set(b.map(e=>String(e.address||"").toLowerCase()));for(let e of n){let r=String(e.address||"").toLowerCase();u.has(r)||(b.push(e),u.add(r))}}if(b.length<3){console.log(`[DealUW] Still only ${b.length} comps, running last-resort search`);let e=`Search for ANY recently sold homes near ${t}, ${s} ${o}.

Search for "sold homes ${t} ${s}" on Zillow and Redfin.

Any size, any style, any age. Sold in the last 12 months.
I need at least 5 results. Return ONLY a JSON array:
${m}

This is critical — you MUST return at least 3 results with real addresses and sale prices.`,n=a((await r(e)).parsed);console.log("[DealUW] Last-resort result:",n.length,"comps");let l=new Set(b.map(e=>String(e.address||"").toLowerCase()));for(let e of n){let r=String(e.address||"").toLowerCase();l.has(r)||(b.push(e),l.add(r))}}return console.log("[DealUW] Total comps found:",b.length),b.length>0?b:g}e.s(["researchComps",()=>s,"researchProperty",()=>t])}];

//# sourceMappingURL=%5Broot-of-the-server%5D__3e57bf4d._.js.map