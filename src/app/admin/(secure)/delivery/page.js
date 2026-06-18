import AdminDeliverySettingsControl from "@/components/admin-delivery-settings-control";
import {
  buildCityServiceMessage,
  buildSameDayDeliveryNotice,
  formatDeliveryCutoffLabel,
  formatServiceZonesLabel,
  getServiceZoneFeeRange,
  isSameDayAvailableNow,
} from "@/lib/delivery-settings";
import { adminFormatters, loadDeliverySettingsAdminData } from "@/lib/admin-dashboard-data";

export const dynamic = "force-dynamic";

export default async function AdminDeliveryPage() {
  const data = await loadDeliverySettingsAdminData();
  const settings = data.settings;
  const sameDayLive = isSameDayAvailableNow(settings);
  const zoneFeeRange = getServiceZoneFeeRange(settings);
  const deliveryFeeLabel = zoneFeeRange
    ? zoneFeeRange.min === zoneFeeRange.max
      ? adminFormatters.currency(zoneFeeRange.min)
      : `${adminFormatters.currency(zoneFeeRange.min)} – ${adminFormatters.currency(zoneFeeRange.max)}`
    : adminFormatters.currency(settings.deliveryFee);

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Delivery</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Manage delivery fees, free-delivery rules, same-day cutoff time, and supported service zones.
        </p>
      </header>

      {data.warnings.length ? (
        <section
          style={{
            marginBottom: 12,
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            color: "#9a3412",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <strong>Some delivery settings are partial.</strong>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Delivery Fee Range</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{deliveryFeeLabel}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Free Delivery Threshold</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.currency(settings.freeDeliveryThreshold)}</p>
        </article>
        <article style={{ border: "1px solid #dcfce7", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#166534", fontSize: 12 }}>Same-Day Status</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#166534" }}>
            {settings.sameDayEnabled ? (sameDayLive ? "Open now" : "Closed for today") : "Disabled"}
          </p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Cutoff</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{formatDeliveryCutoffLabel(settings.sameDayCutoffTime)}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Service Zones</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>
            {adminFormatters.number((settings.serviceZoneFees || settings.serviceZones || []).length)}
          </p>
        </article>
      </section>

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff", marginBottom: 16 }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Customer-Facing Summary</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            This is the message and zone policy the storefront currently derives from your settings.
          </p>
        </div>
        <div style={{ padding: 12, display: "grid", gap: 10 }}>
          <p style={{ margin: 0, color: "#334155" }}>
            <strong>Zones:</strong> {formatServiceZonesLabel(settings)}
          </p>
          <p style={{ margin: 0, color: "#334155" }}>
            <strong>Zone validation:</strong> {buildCityServiceMessage(settings)}
          </p>
          <p style={{ margin: 0, color: "#334155" }}>
            <strong>Same-day note:</strong> {buildSameDayDeliveryNotice(settings)}
          </p>
        </div>
      </section>

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Update Delivery Settings</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            These values feed cart totals, checkout validation, promo calculations, and server-side order pricing.
          </p>
        </div>
        <div style={{ padding: 12 }}>
          <AdminDeliverySettingsControl
            deliveryFee={settings.deliveryFee}
            freeDeliveryThreshold={settings.freeDeliveryThreshold}
            sameDayEnabled={settings.sameDayEnabled}
            sameDayCutoffTime={settings.sameDayCutoffTime}
            serviceZones={settings.serviceZones}
            serviceZoneFees={settings.serviceZoneFees}
            sameDayNotice={settings.sameDayNotice}
          />
        </div>
      </section>
    </main>
  );
}
