"use client";
import { useState } from "react";
import { IconArrowRight, IconCheck } from "@tabler/icons-react";

export default function WaitlistForm({ classNames }) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  async function submit(event) {
    event.preventDefault(); setStatus("loading"); setMessage("");
    const form = new FormData(event.currentTarget); const params = new URLSearchParams(window.location.search);
    const body = { fullName:form.get("fullName"),email:form.get("email"),phone:form.get("phone"),city:form.get("city"),marketingConsent:form.get("marketingConsent")==="on",utmSource:params.get("utm_source"),utmMedium:params.get("utm_medium"),utmCampaign:params.get("utm_campaign") };
    try { const response=await fetch("/api/waitlist",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); const result=await response.json(); if(!response.ok) throw new Error(result.error||"We couldn’t add you right now."); setStatus("success"); setMessage(result.message); event.currentTarget.reset(); }
    catch(error){setStatus("error");setMessage(error.message);}
  }
  if(status==="success") return <div className={classNames.success} role="status"><i><IconCheck/></i><div><b>You’re on the list!</b><p>{message}</p></div></div>;
  return <form className={classNames.form} onSubmit={submit}><div className={classNames.fields}>
    <label><span>Full name</span><input name="fullName" autoComplete="name" required maxLength={100} placeholder="Your full name"/></label>
    <label><span>Email address</span><input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com"/></label>
    <label><span>Phone number <small>(optional)</small></span><input name="phone" type="tel" autoComplete="tel" maxLength={24} placeholder="+234 800 000 0000"/></label>
    <label><span>City</span><input name="city" autoComplete="address-level2" required maxLength={80} defaultValue="Ibadan"/></label>
  </div><label className={classNames.consent}><input name="marketingConsent" type="checkbox"/><span>Send me Meal05 offers, product news and launch updates. I can unsubscribe at any time.</span></label>
  <button disabled={status==="loading"}>{status==="loading"?"Joining…":<>Join the waitlist <IconArrowRight/></>}</button>{status==="error"&&<p className={classNames.error} role="alert">{message}</p>}<p className={classNames.privacy}>We’ll only use your details for early access and the updates you choose above. No spam.</p></form>;
}
