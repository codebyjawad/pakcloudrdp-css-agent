import React, { useState, useEffect } from 'react';
import { Copy, Check, Server, Globe, Cpu, HardDrive, Shield, Eye, X } from 'lucide-react';
import { api } from '../services/api';

const REGIONS = [
  { id: 'us', name: 'United States', flag: '🇺🇸' },
  { id: 'uk', name: 'United Kingdom', flag: '🇬🇧' },
  { id: 'eu', name: 'Europe (Germany/NL)', flag: '🇪🇺' },
  { id: 'in', name: 'India', flag: '🇮🇳' },
  { id: 'sg', name: 'Singapore', flag: '🇸🇬' },
  { id: 'au', name: 'Australia', flag: '🇦🇺' },
  { id: 'jp', name: 'Japan', flag: '🇯🇵' },
  { id: 'global', name: 'All Regions', flag: '🌍' }
];

// Universal clipboard copy that works across all protocols and mobile browsers
function copyTextToClipboard(text) {
  // Method 1: execCommand with un-hidden textarea (100% reliable across HTTP/HTTPS and mobile)
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) return true;
  } catch (err) {
    console.warn('execCommand failed, trying navigator.clipboard:', err);
  }

  // Method 2: Modern Clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch((e) => console.warn('Clipboard writeText failed:', e));
    return true;
  }

  return false;
}

export default function PlansView() {
  const [plans, setPlans] = useState([]);
  const [priceMatrix, setPriceMatrix] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState('us');
  const [copiedAll, setCopiedAll] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [previewText, setPreviewText] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPlans()
      .then((data) => {
        if (data?.plans) setPlans(data.plans);
        if (data?.priceMatrix) setPriceMatrix(data.priceMatrix);
      })
      .catch((err) => console.error('Failed to load plans:', err))
      .finally(() => setLoading(false));
  }, []);

  const currentRegionObj = REGIONS.find((r) => r.id === selectedRegion) || REGIONS[0];

  // Helper to get real price for plan & region
  const getPrice = (planId, regionId) => {
    const r = (regionId || 'us').toLowerCase();
    const matrixRegion = r === 'global' ? 'eu' : r;
    const price = priceMatrix[planId]?.[matrixRegion] || priceMatrix[planId]?.['eu'] || 1500;
    return Number(price);
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Generate single plan quote text
  const getSinglePlanText = (plan) => {
    const price = getPrice(plan.id, selectedRegion);
    return `*${plan.name} Dedicated Windows RDP (${currentRegionObj.flag} ${currentRegionObj.name})*\n` +
      `• CPU: ${plan.vcpu || plan.cpu || 'Multi-core'}\n` +
      `• RAM: ${plan.ram}\n` +
      `• NVMe Storage: ${plan.nvme || plan.storage || 'Fast NVMe'}\n` +
      `• Uplink: 1 Gbps Port (Unmetered Bandwidth)\n` +
      `• Dedicated Private IP (100% Dedicated)\n` +
      `• Price: ₨${price.toLocaleString()}/month\n` +
      `• Region: ${currentRegionObj.flag} ${currentRegionObj.name}\n` +
      `• Delivery: 30 minutes after payment verification\n` +
      `• Payments: JazzCash, Raast, NayaPay, UBL Bank Transfer`;
  };

  // Copy single plan quote
  const copyPlanDetails = (plan) => {
    const text = getSinglePlanText(plan);
    copyTextToClipboard(text);
    setCopiedId(plan.id);
    showToast(`✅ Copied ${plan.name} quote to clipboard!`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Generate ALL plans quote text
  const getAllPlansText = () => {
    let text = `💵 *PAKCLOUDRDP — COMPLETE PRICE & SPECS LIST (${currentRegionObj.flag} ${currentRegionObj.name})*\n` +
      `*(100% Dedicated Machine · Dedicated Private IP · 1 Gbps Port · Unmetered)*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    plans.forEach((p, idx) => {
      const numEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'][idx] || '•';
      const star = p.id === 'starter' ? ' ⭐ *(Most Popular)*' : '';
      const price = getPrice(p.id, selectedRegion);
      const vcpu = p.vcpu || p.cpu || '';
      const nvme = p.nvme || p.storage || '';
      text += `${numEmoji} *${p.name}*: ${vcpu} · ${p.ram} RAM · ${nvme} ➔ *₨${price.toLocaleString()}/mo*${star}\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🌍 *Selected Region:* ${currentRegionObj.flag} ${currentRegionObj.name}\n` +
      `⚡ *Setup Time:* 30 Minutes after payment confirmation\n` +
      `💳 *Payment Accounts:* JazzCash, Raast, NayaPay, UBL Bank\n\n` +
      `Aapko inme se kaunsa plan aur use-case k liye chahiye? 🚀`;

    return text;
  };

  // Copy ALL plans formatted for a specific region
  const copyAllPlansForRegion = () => {
    if (!plans.length) return;
    const text = getAllPlansText();
    copyTextToClipboard(text);
    setCopiedAll(true);
    showToast(`✅ Copied all ${plans.length} plans for ${currentRegionObj.name}!`);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading pricing matrix...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', position: 'relative' }}>
      {/* FLOATING SUCCESS TOAST */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: '#064e3b',
          border: '1px solid var(--emerald)',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 25px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          zIndex: 100,
          fontWeight: 600,
          fontSize: '13.5px',
          animation: 'pop-in 0.2s ease-out'
        }}>
          <Check size={18} color="var(--emerald)" />
          {toastMessage}
        </div>
      )}

      {/* TEXT PREVIEW MODAL */}
      {previewText && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99,
          padding: 20
        }}>
          <div style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-xl)',
            width: '100%',
            maxWidth: '560px',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>
                Formatted Plan Quote
              </h3>
              <button
                className="icon-btn"
                onClick={() => setPreviewText(null)}
              >
                <X size={16} />
              </button>
            </div>

            <textarea
              readOnly
              value={previewText}
              onFocus={(e) => e.target.select()}
              rows={12}
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: '#fff',
                padding: 14,
                fontFamily: 'inherit',
                fontSize: '13px',
                lineHeight: 1.5,
                resize: 'none'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                className="btn-primary"
                onClick={() => {
                  copyTextToClipboard(previewText);
                  showToast('✅ Copied to clipboard!');
                  setPreviewText(null);
                }}
              >
                <Copy size={16} />
                Copy to Clipboard
              </button>
              <button
                className="btn-primary"
                style={{ background: 'rgba(255,255,255,0.06)', boxShadow: 'none' }}
                onClick={() => setPreviewText(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP REGION SELECTOR BAR & BATCH COPY */}
      <div style={{
        padding: '20px 24px',
        background: 'var(--bg-surface-elevated)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Select Region for Customer Quote:
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {REGIONS.map((r) => (
              <button
                key={r.id}
                className={`filter-pill ${selectedRegion === r.id ? 'active' : ''}`}
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => setSelectedRegion(r.id)}
              >
                <span>{r.flag}</span>
                <span>{r.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons: Copy All + Preview Text */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="icon-btn"
            style={{ width: 'auto', padding: '0 14px', gap: 6, fontSize: '12px', height: '40px' }}
            title="Preview formatted text"
            onClick={() => setPreviewText(getAllPlansText())}
          >
            <Eye size={15} />
            <span>View Text</span>
          </button>

          <button
            className="btn-primary"
            style={{
              background: copiedAll ? 'var(--emerald)' : 'var(--accent-primary)',
              padding: '10px 20px',
              fontSize: '13.5px',
              height: '40px',
              boxShadow: copiedAll ? '0 4px 15px rgba(16,185,129,0.4)' : '0 4px 15px var(--accent-primary-glow)'
            }}
            onClick={copyAllPlansForRegion}
          >
            {copiedAll ? <Check size={18} /> : <Copy size={18} />}
            <span>
              {copiedAll
                ? `Copied All Plans for ${currentRegionObj.name}!`
                : `Copy All Plans (${currentRegionObj.flag} ${currentRegionObj.name})`}
            </span>
          </button>
        </div>
      </div>

      {/* INDIVIDUAL PLAN CARDS GRID */}
      <div className="pricing-grid">
        {plans.map((plan) => {
          const isFeatured = plan.id === 'starter';
          const isCopied = copiedId === plan.id;
          const price = getPrice(plan.id, selectedRegion);

          return (
            <div key={plan.id} className={`plan-card ${isFeatured ? 'featured' : ''}`}>
              {isFeatured && <span className="plan-badge">⭐ Most Popular</span>}

              <div>
                <h3 className="plan-name">{plan.name}</h3>
                <div className="plan-price">
                  ₨{price.toLocaleString()}
                  <span>/ month</span>
                </div>
              </div>

              <div className="plan-specs">
                <div className="spec-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Cpu size={14} color="var(--sky)" /> vCPU
                  </span>
                  <strong>{plan.vcpu || plan.cpu}</strong>
                </div>
                <div className="spec-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Server size={14} color="var(--accent-primary)" /> RAM
                  </span>
                  <strong>{plan.ram}</strong>
                </div>
                <div className="spec-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <HardDrive size={14} color="var(--emerald)" /> Storage
                  </span>
                  <strong>{plan.nvme || plan.storage}</strong>
                </div>
                <div className="spec-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Shield size={14} color="var(--amber)" /> IP Type
                  </span>
                  <strong>Dedicated Private IP</strong>
                </div>
                <div className="spec-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Globe size={14} color="var(--msg-color)" /> Selected Region
                  </span>
                  <strong>{currentRegionObj.flag} {currentRegionObj.name}</strong>
                </div>
              </div>

              <button
                className="copy-plan-btn"
                onClick={() => copyPlanDetails(plan)}
              >
                {isCopied ? <Check size={16} color="var(--emerald)" /> : <Copy size={16} />}
                <span>{isCopied ? `Copied ${plan.name} (${currentRegionObj.id.toUpperCase()})!` : `Copy ${plan.name} Quote`}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
