const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

const serialiseJsonLd = (data) =>
  JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(new RegExp(LS, "g"), "\\u2028")
    .replace(new RegExp(PS, "g"), "\\u2029");

export default function JsonLdScript({ id, data }) {
  if (!data) return null;
  if (Array.isArray(data) && data.length === 0) return null;

  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialiseJsonLd(data) }}
    />
  );
}
