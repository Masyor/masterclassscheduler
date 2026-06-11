import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert } from 'lucide-react';
import { ClassDefinition, SolverSettings } from '../types';
import ClassDataPanel from './ClassDataPanel';

interface Props {
  show: boolean;
  onClose: () => void;
  classes: ClassDefinition[];
  setClasses: (c: ClassDefinition[]) => void;
  settings: SolverSettings;
  setSettings: (s: SolverSettings) => void;
  onOptimize: () => void;
  onResetToDefault: () => void;
  isSolving: boolean;
  unscheduledClasses: Array<{ week: number; room: string; class: ClassDefinition }>;
}

export default function SettingsModal({ show, onClose, classes, setClasses, settings, setSettings, onOptimize, onResetToDefault, isSolving, unscheduledClasses }: Props) {
  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl p-6 max-w-4xl w-full shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
              <h3 className="text-lg font-bold text-slate-900">Settings & Configuration</h3>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto py-4 space-y-6">
              <ClassDataPanel
                classes={classes}
                setClasses={setClasses}
                settings={settings}
                setSettings={setSettings}
                onOptimize={onOptimize}
                onResetToDefault={onResetToDefault}
                isSolving={isSolving}
              />
              
              {/* Unscheduled Classes Diagnostics Drawer */}
              {unscheduledClasses.length > 0 && (
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 space-y-3 shadow-sm">
                  <h4 className="text-xs font-bold text-rose-950 flex items-center gap-1.5 uppercase tracking-wider">
                    <ShieldAlert className="w-4.5 h-4.5 text-rose-600 shrink-0" />
                    Sizing & Capacity Bottlenecks ({unscheduledClasses.length})
                  </h4>
                  <p className="text-[11px] text-rose-800 leading-relaxed">
                    The selected rooms do not have enough slots to place the following classes on their teaching days. Adjust your <strong className="font-semibold text-rose-950">Room Capacities</strong>, change days, or reduce collision groupings to resolve:
                  </p>
                  <div className="border border-rose-150 rounded-lg max-h-40 overflow-y-auto divide-y divide-rose-150 bg-white">
                    {unscheduledClasses.map((item, idx) => (
                      <div key={idx} className="p-2.5 flex justify-between items-center text-xs text-rose-900 font-medium hover:bg-rose-50/20">
                        <div>
                          <span className="font-bold block text-rose-950">{item.class.name}</span>
                          <span className="text-[10px] text-rose-500 block">
                            Week {item.week} &bull; Room {item.room} &bull; Runs {item.class.days.join('/')} at {item.class.time}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
