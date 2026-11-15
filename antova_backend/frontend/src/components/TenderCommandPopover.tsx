'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ReviewTenderRow } from '../lib/types';
import {
  Search,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  Clock,
  Command,
  X,
  FileSpreadsheet,
} from 'lucide-react';

interface TenderCommandPopoverProps {
  tenders: ReviewTenderRow[];
  activeTenderId: string;
  onSelectTender?: (tenderId: string) => void;
}

export function TenderCommandPopover({
  tenders,
  activeTenderId,
  onSelectTender,
}: TenderCommandPopoverProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeTender = tenders.find((t) => t.tender_id === activeTenderId) || tenders[0];

  // Filtered list
  const filteredTenders = query.trim()
    ? tenders.filter(
        (t) =>
          t.tender_id.toLowerCase().includes(query.toLowerCase()) ||
          t.title.toLowerCase().includes(query.toLowerCase())
      )
    : tenders;

  // Toggle or open
  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        setQuery('');
        setSelectedIndex(0);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      return next;
    });
  };

  // Keyboard shortcut listener (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => {
          if (!prev) {
            setQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
            return true;
          }
          return false;
        });
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Keyboard navigation within list
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredTenders.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredTenders.length) % (filteredTenders.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredTenders[selectedIndex]) {
        handleSelect(filteredTenders[selectedIndex].tender_id);
      }
    }
  };

  const handleSelect = (tenderId: string) => {
    setIsOpen(false);
    if (onSelectTender) {
      onSelectTender(tenderId);
    } else {
      router.push(`/audit/${tenderId}`);
    }
  };

  const handleCreateNew = () => {
    setIsOpen(false);
    router.push('/ingest');
  };

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Trigger Button */}
      <button
        onClick={handleToggle}
        type="button"
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors shadow-2xs text-xs font-medium focus:outline-none focus:ring-1 focus:ring-zinc-400"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <span className="text-zinc-500 dark:text-zinc-400">Tender:</span>
        <span className="font-semibold text-zinc-900 dark:text-white font-mono">
          {activeTender?.tender_id || activeTenderId || 'Choose tender'}
        </span>
        {activeTender?.status === 'VERIFIED' ? (
          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            Signed off
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            Draft
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
      </button>

      {/* Popover Command Dialog */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-[380px] sm:w-[460px] bg-white dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 overflow-hidden font-sans text-xs">
          {/* Search Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Search tenders"
              className="w-full bg-transparent border-none text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 text-xs focus:outline-none"
            />
            {query ? (
              <button
                onClick={() => setQuery('')}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                <Command className="w-2.5 h-2.5" /> K
              </span>
            )}
          </div>

          {/* Section: Tenders List */}
          <div className="max-h-64 overflow-y-auto p-1.5 space-y-1">
            <div className="px-2 py-1 text-[10px] uppercase font-semibold text-zinc-500 tracking-wider flex items-center justify-between">
              <span>{query ? 'Results' : 'Tenders'}</span>
              <span>{filteredTenders.length} available</span>
            </div>

            {filteredTenders.length === 0 ? (
              <div className="py-6 text-center text-zinc-500 dark:text-zinc-400 text-xs">
                No tenders match &quot;{query}&quot;
              </div>
            ) : (
              filteredTenders.map((tender, index) => {
                const isActive = tender.tender_id === activeTenderId;
                const isHighlighted = index === selectedIndex;
                const isVerified = tender.status === 'VERIFIED';

                return (
                  <button
                    key={tender.tender_id}
                    onClick={() => handleSelect(tender.tender_id)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full text-left px-2.5 py-2 rounded-md transition-colors flex items-start justify-between gap-3 ${
                      isHighlighted
                        ? 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-white'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-xs text-zinc-900 dark:text-white">
                          {tender.tender_id}
                        </span>
                        {isActive && (
                          <span className="text-[10px] px-1 py-0.2 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate mt-0.5">
                        {tender.title}
                      </p>
                      <div className="flex items-center gap-3 text-[10px] text-zinc-500 mt-1 font-mono">
                        <span>{tender.open_items ?? 0} open items</span>
                        {tender.ingested_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(tender.ingested_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 pt-0.5">
                      {isVerified ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Signed off
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Draft
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer Action: Create New Tender */}
          <div className="p-2 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 flex items-center justify-between text-xs">
            <button
              onClick={handleCreateNew}
              className="flex items-center gap-1.5 px-2 py-1 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors font-medium text-[11px]"
            >
              <PlusCircle className="w-3.5 h-3.5 text-zinc-500" />
              <span>Upload new tender</span>
            </button>
            <span className="text-[10px] text-zinc-400 font-mono">Esc to close</span>
          </div>
        </div>
      )}
    </div>
  );
}
