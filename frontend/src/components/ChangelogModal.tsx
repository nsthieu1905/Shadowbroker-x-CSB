"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Shield, Satellite, MapPin, Palette, ToggleRight, Bug, Heart } from "lucide-react";

const CURRENT_VERSION = "0.8";
const STORAGE_KEY = `shadowbroker_changelog_v${CURRENT_VERSION}`;

const NEW_FEATURES = [
    {
        icon: <Shield size={14} className="text-pink-400" />,
        title: "POTUS Fleet Tracking",
        desc: "Air Force One, Air Force Two, and Marine One aircraft now display with oversized hot-pink icons and a gold dashed halo ring — instantly recognizable on the map.",
        color: "pink",
    },
    {
        icon: <Palette size={14} className="text-yellow-400" />,
        title: "Full Aircraft Color-Coding",
        desc: "9-color system: military (yellow), medical/rescue (lime), police/government (blue), privacy (black), VIPs (hot pink), dictators/oligarchs (red), and more — all enriched from plane_alert_db.",
        color: "yellow",
    },
    {
        icon: <Satellite size={14} className="text-green-400" />,
        title: "Sentinel-2 Satellite Overhaul",
        desc: "Replaced the tiny satellite popup with a fullscreen image overlay. Added Download, Copy to Clipboard, and Open Full Res buttons. Green dossier-themed UI.",
        color: "green",
    },
    {
        icon: <MapPin size={14} className="text-blue-400" />,
        title: "Region Dossier & Carrier Fidelity",
        desc: "Fixed Nominatim 429 rate-limit errors with retry/backoff. Carriers at shared homeports now dock at distinct pier positions instead of stacking.",
        color: "blue",
    },
    {
        icon: <Zap size={14} className="text-cyan-400" />,
        title: "Overhauled Map Legend & Controls",
        desc: "Full 9-color aircraft legend with POTUS fleet, wildfires, and infrastructure sections. New version badge, update checker, and Discussions shortcut in the UI.",
        color: "cyan",
    },
    {
        icon: <ToggleRight size={14} className="text-purple-400" />,
        title: "Toggle All Data Layers",
        desc: "One-click button to enable/disable all data layers at once. Turns cyan when active. MODIS Terra excluded from bulk toggle to prevent accidental imagery load.",
        color: "purple",
    },
];

const BUG_FIXES = [
    "POTUS fleet ICAO codes expanded — all Air Force Two (C-32A/B) airframes now correctly identified with gold halo",
    "POTUS icon priority fixed — presidential aircraft always show the POTUS icon even when grounded",
    "Sentinel-2 imagery no longer overlaps the bottom coordinate bar",
    "Docker ENV format warnings resolved (legacy syntax → key=value)",
    "Settings/Key/Version buttons now cyan in dark mode, grey only in light mode",
];

const CONTRIBUTORS = [
    { name: "@suranyami", desc: "Parallel multi-arch Docker builds (11min → 3min) + runtime BACKEND_URL fix", pr: "#35, #44" },
];

export function useChangelog() {
    const [show, setShow] = useState(false);
    useEffect(() => {
        const seen = localStorage.getItem(STORAGE_KEY);
        if (!seen) setShow(true);
    }, []);
    return { showChangelog: show, setShowChangelog: setShow };
}

interface ChangelogModalProps {
    onClose: () => void;
}

const ChangelogModal = React.memo(function ChangelogModal({ onClose }: ChangelogModalProps) {
    const handleDismiss = () => {
        localStorage.setItem(STORAGE_KEY, "true");
        onClose();
    };

    return (
        <AnimatePresence>
            <motion.div
                key="changelog-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000]"
                onClick={handleDismiss}
            />
            <motion.div
                key="changelog-modal"
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed inset-0 z-[10001] flex items-center justify-center pointer-events-none"
            >
                <div
                    className="w-[560px] max-h-[85vh] bg-[var(--bg-secondary)]/98 border border-cyan-900/50 rounded-xl shadow-[0_0_80px_rgba(0,200,255,0.08)] pointer-events-auto flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="p-5 pb-3 border-b border-[var(--border-primary)]/80">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-3">
                                    <div className="px-2 py-1 rounded bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-mono font-bold text-cyan-400 tracking-widest">
                                        v{CURRENT_VERSION}
                                    </div>
                                    <h2 className="text-sm font-bold tracking-[0.15em] text-[var(--text-primary)] font-mono">
                                        WHAT&apos;S NEW
                                    </h2>
                                </div>
                                <p className="text-[9px] text-[var(--text-muted)] font-mono tracking-widest mt-1">
                                    SHADOWBROKER INTELLIGENCE PLATFORM UPDATE
                                </p>
                            </div>
                            <button
                                onClick={handleDismiss}
                                className="w-8 h-8 rounded-lg border border-[var(--border-primary)] hover:border-red-500/50 flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 transition-all hover:bg-red-950/20"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto styled-scrollbar p-5 space-y-4">
                        {/* New Features */}
                        <div>
                            <div className="text-[9px] font-mono tracking-[0.2em] text-cyan-400 font-bold mb-3 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                NEW CAPABILITIES
                            </div>
                            <div className="space-y-2">
                                {NEW_FEATURES.map((f) => (
                                    <div key={f.title} className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border-primary)]/50 bg-[var(--bg-primary)]/30 hover:border-[var(--border-secondary)] transition-colors">
                                        <div className="mt-0.5 flex-shrink-0">{f.icon}</div>
                                        <div>
                                            <div className="text-[10px] font-mono text-[var(--text-primary)] font-bold">{f.title}</div>
                                            <div className="text-[9px] font-mono text-[var(--text-muted)] leading-relaxed mt-0.5">{f.desc}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Bug Fixes */}
                        <div>
                            <div className="text-[9px] font-mono tracking-[0.2em] text-green-400 font-bold mb-3 flex items-center gap-2">
                                <Bug size={10} className="text-green-400" />
                                FIXES &amp; IMPROVEMENTS
                            </div>
                            <div className="space-y-1.5">
                                {BUG_FIXES.map((fix, i) => (
                                    <div key={i} className="flex items-start gap-2 px-3 py-1.5">
                                        <span className="text-green-500 text-[10px] mt-0.5 flex-shrink-0">+</span>
                                        <span className="text-[9px] font-mono text-[var(--text-secondary)] leading-relaxed">{fix}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Contributors */}
                        <div>
                            <div className="text-[9px] font-mono tracking-[0.2em] text-pink-400 font-bold mb-3 flex items-center gap-2">
                                <Heart size={10} className="text-pink-400" />
                                COMMUNITY CONTRIBUTORS
                            </div>
                            <div className="space-y-1.5">
                                {CONTRIBUTORS.map((c, i) => (
                                    <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg border border-pink-500/20 bg-pink-500/5">
                                        <span className="text-pink-400 text-[10px] mt-0.5 flex-shrink-0">&hearts;</span>
                                        <div>
                                            <span className="text-[10px] font-mono text-pink-300 font-bold">{c.name}</span>
                                            <span className="text-[9px] font-mono text-[var(--text-muted)]"> — {c.desc}</span>
                                            <span className="text-[8px] font-mono text-[var(--text-muted)]"> (PR {c.pr})</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-[var(--border-primary)]/80 flex items-center justify-center">
                        <button
                            onClick={handleDismiss}
                            className="px-8 py-2.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/25 text-[10px] font-mono tracking-[0.2em] transition-all"
                        >
                            ACKNOWLEDGED
                        </button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
});

export default ChangelogModal;
