import React, { useState, useEffect } from 'react';
import { ClassDefinition, SolverSettings } from './types';
import { solveGILCSchedule, getLevelSequence } from './utils/solver';
import { DEFAULT_CLASSES, DEFAULT_SETTINGS, VALID_DAYS, VALID_TIMESLOTS } from './utils/defaultData';
import ClassDataPanel from './components/ClassDataPanel';
import ScheduleGrid from './components/ScheduleGrid';
import SettingsModal from './components/SettingsModal';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, ShieldAlert, BadgeInfo, CheckCircle2, AlertCircle, Sparkles,
  Download, Copy, X, Check, RefreshCw, Settings
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function App() {
  // Configured classes and active system settings
  const [classes, setClasses] = useState<ClassDefinition[]>([]);
  const [settings, setSettings] = useState<SolverSettings>(DEFAULT_SETTINGS);
  
  // Current scheduled results across the term ("week-day-time-room")
  const [schedule, setSchedule] = useState<Record<string, string[]>>({});
  const [classOffsets, setClassOffsets] = useState<Record<string, number>>({});
  
  // Unscheduled diagnostics matching the new solver structure
  const [unscheduledClasses, setUnscheduledClasses] = useState<Array<{ week: number; room: string; class: ClassDefinition }>>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isSolving, setIsSolving] = useState(false);
  const [isPerfectScore, setIsPerfectScore] = useState(true);

  // States for clean custom notifications (avoiding native alerts/confirms in sandbox iframe)
  const [notification, setNotification] = useState<{
    title: string;
    message: string;
    csvData?: string;
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [copiedCSV, setCopiedCSV] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Run solver on settings or classes change
  const runSchedulerAlgorithm = () => {
    setIsSolving(true);
    setTimeout(() => {
      const result = solveGILCSchedule(classes, settings);
      setSchedule(result.schedule);
      setClassOffsets(result.classOffsets || {});
      setUnscheduledClasses(result.unscheduled);
      setStatusMessage(result.message);
      setIsPerfectScore(result.isPerfect);
      setIsSolving(false);
    }, 400); // Satisfying loading feedback
  };

  // Solve automatically on first load, or when classes or settings change
  useEffect(() => {
    runSchedulerAlgorithm();
  }, [classes, settings]);

  const handleResetToDefault = () => {
    setConfirmReset(true);
  };

  const executeReset = () => {
    setClasses([]);
    setSettings(DEFAULT_SETTINGS);
    setConfirmReset(false);
  };
    
  // High-fidelity CSV export supporting teachers, class codes, and rooms
  const handleExportToSpreadsheet = () => {
    const numWeeks = settings.termLengthWeeks || 10;
    
    // Sort days chronologically based on normal week sequence
    const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const activeDays = Array.from(new Set<string>(classes.flatMap(c => c.days))).sort((a, b) => {
      return dayOrder.indexOf(a) - dayOrder.indexOf(b);
    });
    const days = activeDays.length > 0 ? activeDays : VALID_DAYS;

    // Collect all unique timeslots occurring in dataset to guarantee nothing is omitted
    const uniqueTimeslots = Array.from(new Set<string>(classes.map(c => c.time))).sort();
    const timeslots = uniqueTimeslots.length > 0 ? uniqueTimeslots : VALID_TIMESLOTS;

    const rooms = settings.rooms || [{ name: 'GILC' }];

    // Excel CSV Headers
    let csvContent = 'Week,Room,Day,Timeslot,Class Name(s),Teacher(s),Section Code(s)\n';

    for (let w = 1; w <= numWeeks; w++) {
      days.forEach(day => {
        timeslots.forEach(time => {
          rooms.forEach(room => {
            const key = `${w}-${day}-${time}-${room.name}`;
            const classIds = schedule[key] || [];
            if (classIds.length > 0) {
              const cellClasses = classIds.map(id => classes.find(c => c.id === id)).filter(Boolean) as ClassDefinition[];
              
              const classNames = cellClasses.map(c => c.name).join(', ');
              const teachers = cellClasses.map(c => c.teacher || 'N/A').join(', ');
              const codes = cellClasses.map(c => c.classCode || 'N/A').join(', ');

              // Safe quoting in case of values containing commas
              csvContent += `Week ${w},${room.name},${day},${time},"${classNames}","${teachers}","${codes}"\n`;
            }
          });
        });
      });
    }

    // Append metadata save settings block so files preserve rule configurations
    csvContent += `\n#SETTINGS_METADATA_START#\n#${JSON.stringify(settings)}\n#SETTINGS_METADATA_END#\n`;

    // Direct File Download block
    try {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'gilc_multi_room_schedule.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.warn('File download error in iframe sandboxing', e);
    }

    // Clipboard checking block with safe fallbacks
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(csvContent)
        .then(() => {
          setNotification({
            title: 'Schedule Compiled & Copied!',
            message: 'The chronological GILC classroom master schedule has been copied to your clipboard in Google Sheets format. If your browser supports programmatic file operations, the .csv file has also been downloaded to your device.',
            csvData: csvContent
          });
        })
        .catch((err) => {
          console.warn('Clipboard writing blocked inside iframe', err);
          setNotification({
            title: 'Schedule CSV Export Ready!',
            message: 'We successfully compiled your Multi-Room Master Schedule. Since browser clipboard access is restricted inside this iframe workspace, you can manually copy the spreadsheet rows below:',
            csvData: csvContent
          });
        });
    } else {
      setNotification({
        title: 'Schedule CSV Export Ready!',
        message: 'We successfully compiled your Multi-Room Master Schedule. Since your browser limits clipboard operations from within sandboxed spaces, you can copy the spreadsheet rows below manually (press Ctrl+A inside the raw box):',
        csvData: csvContent
      });
    }
  };

  const handleExportToPDF = () => {
    const doc = new jsPDF('landscape', 'pt', 'a4');
    const numWeeks = settings.termLengthWeeks || 10;
    const rooms = settings.rooms || [{ name: 'GILC' }];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const timeslots = (settings.timeslotConfiguration || VALID_TIMESLOTS).sort();

    for (let w = 1; w <= numWeeks; w++) {
      if (w > 1) doc.addPage();
      
      doc.setFontSize(18);
      doc.text(`Week ${w} Schedule`, 40, 40);
      
      let startY = 60;
      rooms.forEach((room) => {
        doc.setFontSize(14);
        doc.text(`Room: ${room.name}`, 40, startY);
        startY += 10;
        
        const tableData = timeslots.map(time => {
          const row = [time];
          days.forEach(day => {
            const key = `${w}-${day}-${time}-${room.name}`;
            const classIds = schedule[key] || [];
            const classNames = classIds.map(id => {
              const c = classes.find(cl => cl.id === id);
              return c ? `${c.name} (${c.teacher || 'N/A'}, ${c.classCode || 'N/A'})` : '';
            }).join('\n');
            row.push(classNames);
          });
          return row;
        });

        autoTable(doc, {
          head: [['Time', ...days]],
          body: tableData,
          startY: startY + 10,
          theme: 'striped',
          headStyles: { fillColor: [63, 81, 181] }, // Indigo
          styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: { 0: { cellWidth: 50 } },
        });
        
        // @ts-ignore - jspdf-autotable adds lastAutoTable to the doc
        startY = doc.lastAutoTable.finalY + 30;
      });
    }
    if (unscheduledClasses.length > 0) {
      doc.addPage();
      doc.setFontSize(18);
      doc.text("Unscheduled Classes", 40, 40);
      
      const unscheduledData = unscheduledClasses.map(item => [
          `Week ${item.week}`,                
          item.class.time,
          item.class.name,                   
          item.class.teacher || 'N/A',       
          item.class.classCode || 'N/A'     
      ]);                
      
      autoTable(doc, {
        head: [['Week', 'Time Slot', 'Level', 'Teacher', 'Code']],
        body: unscheduledData,
        startY: 60,
        theme: 'striped',
        headStyles: { fillColor: [225, 29, 72] }, // Rose-600
        styles: { fontSize: 10, cellPadding: 4 },
      });
    }
    doc.save('schedule.pdf');
  };


  // Calculate unique active classes scheduled in at least one week
  const totalClasses = classes.length;
  
  // Calculate total class assignment count vs expected totals
  const totalSlotsCount = (Object.values(schedule) as string[][]).reduce((acc, currentList) => acc + currentList.length, 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col selection:bg-indigo-100 selection:text-indigo-950">
      {/* Visual Header */}
      <header className="bg-white border-b border-slate-100 py-5 px-4 lg:px-8 xl:px-10 shrink-0 shadow-xs">
        <div className="max-w-none mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Calendar className="w-5 h-5 animate-pulse" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 animate-slide-in" id="app-title">
                Masterclass Planner
              </h1>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4" /> Settings
            </button>
          </div>

          {/* Quick Metrics Bar & Optimizer */}
          <div className="flex flex-wrap items-center gap-3">
             <button
              onClick={runSchedulerAlgorithm}
              disabled={isSolving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSolving ? 'animate-spin' : ''}`} />
              Optimize Facility Scheduling
            </button>
            <button
              onClick={handleExportToPDF}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5" />
              Download/Export PDF
            </button>
            {/* Metrics Bar */}
            <div className="flex items-center gap-3">
              <div className="px-3.5 py-1.5 rounded-lg bg-white shadow-2xs border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Classes</span>
                <span className="text-sm font-extrabold text-slate-900 font-mono inline-flex items-center gap-1.5 mt-0.5">
                  {totalClasses} Configured
                </span>
              </div>
              <div className="px-3.5 py-1.5 rounded-lg bg-white shadow-2xs border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Safety Status</span>
                <span className={`text-xs font-bold inline-flex items-center gap-1 mt-0.5 ${isPerfectScore ? 'text-emerald-700' : 'text-amber-500'}`}>
                  {isPerfectScore ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Perfect Slotting
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Resolution Warnings
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-none w-full mx-auto p-4 lg:p-6 xl:px-10 grid grid-cols-1 gap-6 min-h-0" id="main-content">
        {/* Right Column - Visual Schedule Table & Override Interface */}
        <section className="flex flex-col h-full min-h-0">
          <div className="flex-1 min-h-0">
            <ScheduleGrid
              schedule={schedule}
              setSchedule={setSchedule}
              classes={classes}
              settings={settings}
              onExportCSV={handleExportToSpreadsheet}
              classOffsets={classOffsets}
            />
          </div>
        </section>
      </main>

      <SettingsModal
        show={showSettings}
        onClose={() => setShowSettings(false)}
        classes={classes}
        setClasses={setClasses}
        settings={settings}
        setSettings={setSettings}
        onOptimize={runSchedulerAlgorithm}
        onResetToDefault={handleResetToDefault}
        isSolving={isSolving}
        unscheduledClasses={unscheduledClasses}
      />



      {/* Custom Confirmation Dialog */}
      <AnimatePresence>
        {confirmReset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-100 space-y-4"
            >
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                  <ShieldAlert className="w-6 h-6" />
                </span>
                <h3 className="text-lg font-bold text-slate-900">Reset Schedule Settings?</h3>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                Are you sure you want to clear all active classes and restore custom bi-weekly cycle ratios, room configurations, and calendar holidays to original system defaults? Any current changes will be lost.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeReset}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
                >
                  Confirm Reset
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* High-fidelity Custom CSV Notification Modal */}
      <AnimatePresence>
        {notification && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                    <CheckCircle2 className="w-5 h-5" />
                  </span>
                  <h3 className="text-base font-bold text-slate-900">{notification.title}</h3>
                </div>
                <button
                  onClick={() => { setNotification(null); setCopiedCSV(false); }}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 space-y-4">
                <p className="text-xs text-slate-600 leading-normal">
                  {notification.message}
                </p>

                {notification.csvData && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 font-mono uppercase tracking-wider">
                      <span>CSV Format Preview (Google Sheets Ready)</span>
                      <button
                        onClick={() => {
                          if (notification.csvData) {
                            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                              navigator.clipboard.writeText(notification.csvData);
                              setCopiedCSV(true);
                              setTimeout(() => setCopiedCSV(false), 2000);
                            } else {
                              // Fallback: select the textarea
                              const el = document.querySelector('textarea');
                              if (el) {
                                el.focus();
                                el.select();
                                alert('Please press Ctrl+C or Cmd+C to copy the selected text.');
                              }
                            }
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-all cursor-pointer font-sans"
                      >
                        {copiedCSV ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" /> Copy to Clipboard
                          </>
                        )}
                      </button>
                    </div>

                    <textarea
                      readOnly
                      value={notification.csvData}
                      onClick={(e) => {
                        (e.target as HTMLTextAreaElement).select();
                      }}
                      className="w-full h-64 p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] leading-relaxed rounded-xl border border-slate-800 outline-none resize-none focus:ring-1 focus:ring-emerald-500 shadow-inner"
                    />
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-500" /> Pro-tip: Clicking inside the text area will auto-select all lines for quick manual copy!
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4 flex items-center justify-end shrink-0">
                <button
                  onClick={() => { setNotification(null); setCopiedCSV(false); }}
                  className="px-5 py-2 bg-slate-850 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Close Export Manager
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
