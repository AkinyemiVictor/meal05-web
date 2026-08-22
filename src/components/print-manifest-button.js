"use client";

export default function PrintManifestButton() {
  return <button type="button" onClick={() => window.print()}>Print delivery sheet</button>;
}
