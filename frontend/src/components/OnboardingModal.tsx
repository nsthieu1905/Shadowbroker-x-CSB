"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, Key, Shield, Radar, Globe, Satellite, Ship, Radio } from "lucide-react";

const STORAGE_KEY = "shadowbroker_onboarding_complete";

const API_GUIDES = [
  {
    name: "OpenSky Network",
    icon: <Radar size={14} className="text-cyan-400" />,
    required: true,
    description: "Theo dõi chuyến bay với vùng phủ ADS-B toàn cầu. Cung cấp vị trí máy bay theo thời gian thực.",
    steps: [
      "Tạo tài khoản miễn phí tại opensky-network.org",
      "Vào Dashboard → OAuth → Create Client",
      "Sao chép Client ID và Client Secret",
      "Dán cả hai vào Settings → Aviation",
    ],
    url: "https://opensky-network.org/index.php?option=com_users&view=registration",
    color: "cyan",
  },
  {
    name: "AIS Stream",
    icon: <Ship size={14} className="text-blue-400" />,
    required: true,
    description: "Theo dõi tàu theo thời gian thực qua AIS (Automatic Identification System).",
    steps: ["Đăng ký tại aisstream.io", "Mở trang API Keys", "Tạo API key mới", "Dán vào Settings → Maritime"],
    url: "https://aisstream.io/authenticate",
    color: "blue",
  },
];

const FREE_SOURCES = [
  { name: "ADS-B Exchange", desc: "Hàng không quân sự & dân dụng", icon: <Radar size={12} /> },
  { name: "USGS Earthquakes", desc: "Dữ liệu địa chấn toàn cầu", icon: <Globe size={12} /> },
  { name: "CelesTrak", desc: "2.000+ quỹ đạo vệ tinh", icon: <Satellite size={12} /> },
  { name: "GDELT Project", desc: "Sự kiện xung đột toàn cầu", icon: <Globe size={12} /> },
  { name: "RainViewer", desc: "Lớp phủ radar thời tiết", icon: <Globe size={12} /> },
  { name: "OpenMHz", desc: "Nguồn máy quét vô tuyến", icon: <Radio size={12} /> },
  { name: "RSS Feeds", desc: "NPR, BBC, Reuters, AP", icon: <Globe size={12} /> },
  { name: "Yahoo Finance", desc: "Cổ phiếu quốc phòng & dầu", icon: <Globe size={12} /> },
];

interface OnboardingModalProps {
  onClose: () => void;
  onOpenSettings: () => void;
}

const OnboardingModal = React.memo(function OnboardingModal({ onClose, onOpenSettings }: OnboardingModalProps) {
  const [step, setStep] = useState(0);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onClose();
  };

  const handleOpenSettings = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onClose();
    onOpenSettings();
  };

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="onboarding-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000]"
        onClick={handleDismiss}
      />

      {/* Modal */}
      <motion.div
        key="onboarding-modal"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed inset-0 z-[10001] flex items-center justify-center pointer-events-none"
      >
        <div
          className="w-[580px] max-h-[85vh] bg-[var(--bg-secondary)]/98 border border-cyan-900/50 rounded-xl shadow-[0_0_80px_rgba(0,200,255,0.08)] pointer-events-auto flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 pb-4 border-b border-[var(--border-primary)]/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                  <Shield size={20} className="text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold tracking-[0.2em] text-[var(--text-primary)] font-mono">
                    HƯỚNG DẪN KHỞI TẠO
                  </h2>
                  <span className="text-[9px] text-[var(--text-muted)] font-mono tracking-widest">
                    THIẾT LẬP LẦN ĐẦU
                  </span>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="w-8 h-8 rounded-lg border border-[var(--border-primary)] hover:border-red-500/50 flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 transition-all hover:bg-red-950/20"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Step Indicators */}
          <div className="flex gap-2 px-6 pt-4">
            {["Chào mừng", "API Keys", "Nguồn miễn phí"].map((label, i) => (
              <button
                key={label}
                onClick={() => setStep(i)}
                className={`flex-1 py-1.5 text-[9px] font-mono tracking-widest rounded border transition-all ${
                  step === i
                    ? "border-cyan-500/50 text-cyan-400 bg-cyan-950/20"
                    : "border-[var(--border-primary)] text-[var(--text-muted)] hover:border-[var(--border-secondary)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {label.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto styled-scrollbar p-6">
            {step === 0 && (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <div className="text-lg font-bold tracking-[0.3em] text-[var(--text-primary)] font-mono mb-2">
                    P H Ầ N <span className="text-cyan-400">M Ề M</span> <span className="text-cyan-400">F L Y T</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] font-mono leading-relaxed max-w-md mx-auto">
                    Bảng điều khiển OSINT theo thời gian thực, tổng hợp 12+ nguồn dữ liệu. Chuyến bay, tàu, vệ tinh,
                    động đất, xung đột… tất cả trên một bản đồ.
                  </p>
                </div>

                <div className="bg-yellow-950/20 border border-yellow-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <Key size={14} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[11px] text-yellow-400 font-mono font-bold mb-1">Cần API Keys</p>
                      <p className="text-[10px] text-[var(--text-secondary)] font-mono leading-relaxed">
                        Cần 2 API keys để dùng đầy đủ tính năng: <span className="text-cyan-400">OpenSky Network</span>{" "}
                        (flights) và <span className="text-blue-400">AIS Stream</span> (ships). Cả hai đều miễn phí. Nếu
                        thiếu, một số bảng sẽ không có dữ liệu.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-950/20 border border-green-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <Globe size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[11px] text-green-400 font-mono font-bold mb-1">8 Nguồn chạy ngay</p>
                      <p className="text-[10px] text-[var(--text-secondary)] font-mono leading-relaxed">
                        Máy bay quân sự, vệ tinh, động đất, xung đột toàn cầu, radar thời tiết, radio scanners, tin tức
                        và dữ liệu thị trường có thể chạy ngay — không cần key.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                {API_GUIDES.map((api) => (
                  <div
                    key={api.name}
                    className={`rounded-lg border border-${api.color}-900/30 bg-${api.color}-950/10 p-4`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {api.icon}
                        <span className="text-xs font-mono text-white font-bold">{api.name}</span>
                        <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border border-yellow-500/30 text-yellow-400 bg-yellow-950/20">
                          BẮT BUỘC
                        </span>
                      </div>
                      <a
                        href={api.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-[10px] font-mono text-${api.color}-400 hover:text-${api.color}-300 flex items-center gap-1 transition-colors`}
                      >
                        LẤY KEY <ExternalLink size={10} />
                      </a>
                    </div>
                    <p className="text-[10px] text-[var(--text-secondary)] font-mono mb-3">{api.description}</p>
                    <ol className="space-y-1.5">
                      {api.steps.map((s, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span
                            className={`text-[9px] font-mono text-${api.color}-500 font-bold mt-0.5 w-3 flex-shrink-0`}
                          >
                            {i + 1}.
                          </span>
                          <span className="text-[10px] text-gray-300 font-mono">{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}

                <button
                  onClick={handleOpenSettings}
                  className="w-full py-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors text-[11px] font-mono tracking-widest flex items-center justify-center gap-2"
                >
                  <Key size={14} />
                  MỞ SETTINGS ĐỂ NHẬP KEYS
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-[10px] text-[var(--text-secondary)] font-mono mb-3">
                  Các nguồn dữ liệu này hoàn toàn miễn phí và không cần API keys. Chúng tự kích hoạt khi mở ứng dụng.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {FREE_SOURCES.map((src) => (
                    <div
                      key={src.name}
                      className="rounded-lg border border-[var(--border-primary)]/60 bg-[var(--bg-secondary)]/30 p-3 hover:border-[var(--border-secondary)] transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-green-500">{src.icon}</span>
                        <span className="text-[10px] font-mono text-[var(--text-primary)] font-medium">{src.name}</span>
                      </div>
                      <p className="text-[9px] text-[var(--text-muted)] font-mono">{src.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[var(--border-primary)]/80 flex items-center justify-between">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              className={`px-4 py-2 rounded border text-[10px] font-mono tracking-widest transition-all ${
                step === 0
                  ? "border-[var(--border-primary)] text-[var(--text-muted)] cursor-not-allowed"
                  : "border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)]"
              }`}
              disabled={step === 0}
            >
              TRƯỚC
            </button>

            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${step === i ? "bg-cyan-400" : "bg-[var(--border-primary)]"}`}
                />
              ))}
            </div>

            {step < 2 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="px-4 py-2 rounded border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 text-[10px] font-mono tracking-widest transition-all"
              >
                TIẾP
              </button>
            ) : (
              <button
                onClick={handleDismiss}
                className="px-4 py-2 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30 text-[10px] font-mono tracking-widest transition-all"
              >
                BẮT ĐẦU
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (typeof window === "undefined") return false;
    const done = localStorage.getItem(STORAGE_KEY);
    return !done;
  });

  return { showOnboarding, setShowOnboarding };
}

export default OnboardingModal;
