import {timingSafeEqual} from "node:crypto";

export function checkOwnerPin(req, suppliedPin) {
  const expected=process.env.OWNER_PIN;
  if(typeof expected!=="string"||expected.length<8)return {ok:false,configured:false};
  const provided=String(req.headers["x-owner-pin"]||suppliedPin||"");
  const a=Buffer.from(expected,"utf8"),b=Buffer.from(provided,"utf8");
  if(!provided||a.length!==b.length)return {ok:false,configured:true};
  return {ok:timingSafeEqual(a,b),configured:true};
}
