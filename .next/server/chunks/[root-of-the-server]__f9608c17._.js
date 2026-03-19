module.exports=[93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},70406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},24725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},12554,e=>{"use strict";async function t(e){let t=process.env.ANTHROPIC_API_KEY?.trim();if(!t)throw Error("ANTHROPIC_API_KEY not configured");let r=new AbortController,a=setTimeout(()=>r.abort(),6e4);try{let a=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":t,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-5-20250929",max_tokens:16e3,system:'You are a real estate data lookup assistant. You MUST respond with ONLY valid JSON — no explanations, no markdown, no prose. If you cannot find exact data, use your best estimates based on what you find. Never say "I could not find" — always return the requested JSON structure with your best available data.',tools:[{type:"web_search_20250305",name:"web_search",max_uses:5}],messages:[{role:"user",content:e}]}),signal:r.signal});if(!a.ok){let e=await a.text();throw console.error("[DealUW] Anthropic API error:",a.status,e),Error(`Anthropic API error ${a.status}: ${e}`)}let s=await a.json();console.log("[DealUW] Response blocks:",s.content?.map(e=>e.type));let o=s.content.filter(e=>"text"===e.type).map(e=>e.text??"").join("\n");console.log("[DealUW] Text length:",o.length,"preview:",o.substring(0,300));let n=function(e){if(!e)return null;try{return JSON.parse(e)}catch{}let t=e.trim();if(t.startsWith("```")){t=t.replace(/^```(?:json)?\s*\n?/,"").replace(/\n?\s*```\s*$/,"");try{return JSON.parse(t)}catch{}}let r=t.match(/\[[\s\S]*\]/);if(r)try{return JSON.parse(r[0])}catch{}let a=t.match(/\{[\s\S]*\}/);if(a)try{return JSON.parse(a[0])}catch{}return null}(o);return console.log("[DealUW] Parsed:",n?"success":"null"),{text:o,parsed:n}}finally{clearTimeout(a)}}async function r(e,r,a,s){let o=`Search for property details for ${e}, ${r}, ${a} ${s}.

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
}`,{text:n,parsed:l}=await t(o);return l||console.error("[DealUW] researchProperty: failed to parse. Raw text:",n.substring(0,500)),l}function a(e){if(Array.isArray(e)&&e.length>0)return e;if(e&&"object"==typeof e&&!Array.isArray(e)){let t=e.comps||e.results||e.comparables||e.sales||e.data;if(Array.isArray(t)&&t.length>0)return t}return[]}async function s(e,r,s,o,n){let l=Number(n.sqft)||2e3,i=n.property_type??"single family",u=n.year_built??"unknown",d=n.lot_sqft??6e3,c=Math.round(.85*l),p=Math.round(1.15*l),h=new Date(Date.now()-15552e6).toISOString().slice(0,10),m=`[
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
]`,f=`Search for recently sold homes near ${e}, ${r}, ${s} ${o}.

I need comparable sales for a property that is ${l} sqft, ${i} style, built in ${u}, on a ${d} sqft lot.

Search Zillow for "recently sold homes ${r} ${s} ${o}" and Redfin for "sold homes near ${e} ${r} ${s}".

Find 5-10 homes that:
- Sold in the last 6 months (since ${h})
- Are within 1 mile of the subject
- Are between ${c} and ${p} sqft
- Are a similar style home

For EACH home you find, return this data. Return ONLY a JSON array:
${m}

If you cannot find exact matches, broaden your search to the full ${o} zip code. Return whatever sold homes you CAN find — some data is better than none. Do NOT return an empty array unless you truly found nothing.`;console.log("[DealUW] Searching for comps:",e,r,s,o);let{text:y,parsed:g}=await t(f);console.log("[DealUW] Primary search result:",g?`${Array.isArray(g)?g.length:"object"} items`:"null","raw length:",y.length);let b=a(g);if(b.length<3){console.log(`[DealUW] Only ${b.length} comps from primary search, running broader fallback`);let e=`Search for recently sold homes in zip code ${o||"near "+r+" "+s}.

Search Zillow for "recently sold homes ${o||r+" "+s}" and Redfin for "sold homes ${o||r+" "+s}".

I need at least 5 comparable sales. Homes that sold in the last 12 months. Similar to ${l} sqft, ${i} style.
If you can't find exact matches, include any recently sold homes nearby.

Find at least 5, up to 10. Return ONLY a JSON array:
${m}

You MUST return at least 3 results. Broaden your search area if needed. Do NOT return an empty array.`,n=a((await t(e)).parsed);console.log("[DealUW] Fallback result:",n.length,"comps");let u=new Set(b.map(e=>String(e.address||"").toLowerCase()));for(let e of n){let t=String(e.address||"").toLowerCase();u.has(t)||(b.push(e),u.add(t))}}if(b.length<3){console.log(`[DealUW] Still only ${b.length} comps, running last-resort search`);let e=`Search for ANY recently sold homes near ${r}, ${s} ${o}.

Search for "sold homes ${r} ${s}" on Zillow and Redfin.

Any size, any style, any age. Sold in the last 12 months.
I need at least 5 results. Return ONLY a JSON array:
${m}

This is critical — you MUST return at least 3 results with real addresses and sale prices.`,n=a((await t(e)).parsed);console.log("[DealUW] Last-resort result:",n.length,"comps");let l=new Set(b.map(e=>String(e.address||"").toLowerCase()));for(let e of n){let t=String(e.address||"").toLowerCase();l.has(t)||(b.push(e),l.add(t))}}return console.log("[DealUW] Total comps found:",b.length),b.length>0?b:g}e.s(["researchComps",()=>s,"researchProperty",()=>r])},34191,e=>{"use strict";var t=e.i(76809),r=e.i(55331),a=e.i(63037),s=e.i(44513),o=e.i(6802),n=e.i(39513),l=e.i(92165),i=e.i(2989),u=e.i(14757),d=e.i(58606),c=e.i(54545),p=e.i(31713),h=e.i(170),m=e.i(82547),f=e.i(91120),y=e.i(93695);e.i(42823);var g=e.i(64402),b=e.i(55992),_=e.i(12554);async function x(e){try{let{address:t,city:r,state:a,zip:s}=await e.json();if(!t)return b.NextResponse.json({error:"Address is required"},{status:400});let o=await (0,_.researchProperty)(t,r||"",a||"",s||"");if(!o||"object"!=typeof o)return b.NextResponse.json({available:!1,error:"lookup_failed",fallback:"manual"});let n={address:o.address||t,city:o.city||r,state:o.state||a,zip:o.zip||s,beds:w(o.beds),baths:w(o.baths),sqft:w(o.sqft),lot_sqft:w(o.lot_sqft)??w(o.lotSqft)??w(o.lot_size),year_built:w(o.year_built)??w(o.yearBuilt),property_type:o.property_type||o.propertyType||"ranch",stories:w(o.stories),has_pool:R(o.has_pool)||R(o.hasPool),has_garage:R(o.has_garage)||R(o.hasGarage),garage_count:w(o.garage_count)??w(o.garageCount)??0,has_carport:R(o.has_carport)||R(o.hasCarport),has_basement:R(o.has_basement)||R(o.hasBasement),basement_sqft:w(o.basement_sqft)??w(o.basementSqft)??0,has_guest_house:R(o.has_guest_house)||R(o.hasGuestHouse),guest_house_sqft:w(o.guest_house_sqft)??w(o.guestHouseSqft)??0,tax_assessed_value:w(o.tax_assessed_value)??w(o.taxAssessedValue),last_sale_price:w(o.last_sale_price)??w(o.lastSalePrice),last_sale_date:o.last_sale_date??o.lastSaleDate??null,subdivision:o.subdivision||null,zestimate:w(o.zestimate),estimated_rent:w(o.estimated_rent)??w(o.estimatedRent)};return b.NextResponse.json({available:!0,property:n,source:"web_search"})}catch(t){let e=t instanceof Error?t.message:"Property lookup failed";return console.error("[DealUW] Property lookup error:",e),b.NextResponse.json({available:!1,error:e,fallback:"manual"})}}function w(e){if(null==e)return null;let t=Number(e);return isFinite(t)?t:null}function R(e){return null!=e&&("boolean"==typeof e?e:"string"==typeof e?"true"===e.toLowerCase()||"1"===e:!!e)}e.s(["POST",()=>x,"maxDuration",0,60],83058);var v=e.i(83058);let S=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/lookup/property/route",pathname:"/api/lookup/property",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/.openclaw/workspace/projects/DealUW/src/app/api/lookup/property/route.ts",nextConfigOutput:"",userland:v}),{workAsyncStorage:A,workUnitAsyncStorage:N,serverHooks:$}=S;function C(){return(0,a.patchFetch)({workAsyncStorage:A,workUnitAsyncStorage:N})}async function E(e,t,a){S.isDev&&(0,s.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let b="/api/lookup/property/route";b=b.replace(/\/index$/,"")||"/";let _=await S.prepare(e,t,{srcPage:b,multiZoneDraftMode:!1});if(!_)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:x,params:w,nextConfig:R,parsedUrl:v,isDraftMode:A,prerenderManifest:N,routerServerContext:$,isOnDemandRevalidate:C,revalidateOnlyGenerated:E,resolvedPathname:q,clientReferenceManifest:O,serverActionsManifest:k}=_,P=(0,l.normalizeAppPath)(b),T=!!(N.dynamicRoutes[P]||N.routes[q]),D=async()=>((null==$?void 0:$.render404)?await $.render404(e,t,v,!1):t.end("This page could not be found"),null);if(T&&!A){let e=!!N.routes[q],t=N.dynamicRoutes[P];if(t&&!1===t.fallback&&!e){if(R.experimental.adapterPath)return await D();throw new y.NoFallbackError}}let U=null;!T||S.isDev||A||(U="/index"===(U=q)?"/":U);let j=!0===S.isDev||!T,I=T&&!j;k&&O&&(0,n.setManifestsSingleton)({page:b,clientReferenceManifest:O,serverActionsManifest:k});let H=e.method||"GET",M=(0,o.getTracer)(),Y=M.getActiveScopeSpan(),L={params:w,prerenderManifest:N,renderOpts:{experimental:{authInterrupts:!!R.experimental.authInterrupts},cacheComponents:!!R.cacheComponents,supportsDynamicResponse:j,incrementalCache:(0,s.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:R.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,s)=>S.onRequestError(e,t,a,s,$)},sharedContext:{buildId:x}},W=new i.NodeNextRequest(e),F=new i.NodeNextResponse(t),z=u.NextRequestAdapter.fromNodeNextRequest(W,(0,u.signalFromNodeResponse)(t));try{let n=async e=>S.handle(z,L).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=M.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==d.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${H} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${H} ${b}`)}),l=!!(0,s.getRequestMeta)(e,"minimalMode"),i=async s=>{var o,i;let u=async({previousCacheEntry:r})=>{try{if(!l&&C&&E&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let o=await n(s);e.fetchMetrics=L.renderOpts.fetchMetrics;let i=L.renderOpts.pendingWaitUntil;i&&a.waitUntil&&(a.waitUntil(i),i=void 0);let u=L.renderOpts.collectedTags;if(!T)return await (0,p.sendResponse)(W,F,o,L.renderOpts.pendingWaitUntil),null;{let e=await o.blob(),t=(0,h.toNodeOutgoingHttpHeaders)(o.headers);u&&(t[f.NEXT_CACHE_TAGS_HEADER]=u),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==L.renderOpts.collectedRevalidate&&!(L.renderOpts.collectedRevalidate>=f.INFINITE_CACHE)&&L.renderOpts.collectedRevalidate,a=void 0===L.renderOpts.collectedExpire||L.renderOpts.collectedExpire>=f.INFINITE_CACHE?void 0:L.renderOpts.collectedExpire;return{value:{kind:g.CachedRouteKind.APP_ROUTE,status:o.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await S.onRequestError(e,t,{routerKind:"App Router",routePath:b,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:I,isOnDemandRevalidate:C})},!1,$),t}},d=await S.handleResponse({req:e,nextConfig:R,cacheKey:U,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:N,isRoutePPREnabled:!1,isOnDemandRevalidate:C,revalidateOnlyGenerated:E,responseGenerator:u,waitUntil:a.waitUntil,isMinimalMode:l});if(!T)return null;if((null==d||null==(o=d.value)?void 0:o.kind)!==g.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==d||null==(i=d.value)?void 0:i.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});l||t.setHeader("x-nextjs-cache",C?"REVALIDATED":d.isMiss?"MISS":d.isStale?"STALE":"HIT"),A&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let y=(0,h.fromNodeOutgoingHttpHeaders)(d.value.headers);return l&&T||y.delete(f.NEXT_CACHE_TAGS_HEADER),!d.cacheControl||t.getHeader("Cache-Control")||y.get("Cache-Control")||y.set("Cache-Control",(0,m.getCacheControlHeader)(d.cacheControl)),await (0,p.sendResponse)(W,F,new Response(d.value.body,{headers:y,status:d.value.status||200})),null};Y?await i(Y):await M.withPropagatedContext(e.headers,()=>M.trace(d.BaseServerSpan.handleRequest,{spanName:`${H} ${b}`,kind:o.SpanKind.SERVER,attributes:{"http.method":H,"http.target":e.url}},i))}catch(t){if(t instanceof y.NoFallbackError||await S.onRequestError(e,t,{routerKind:"App Router",routePath:P,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:I,isOnDemandRevalidate:C})},!1,$),T)throw t;return await (0,p.sendResponse)(W,F,new Response(null,{status:500})),null}}e.s(["handler",()=>E,"patchFetch",()=>C,"routeModule",()=>S,"serverHooks",()=>$,"workAsyncStorage",()=>A,"workUnitAsyncStorage",()=>N],34191)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__f9608c17._.js.map