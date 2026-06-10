import React, { useState } from 'react';
import { ClassDefinition, SolverSettings, Program } from '../types';
import { VALID_DAYS, VALID_TIMESLOTS } from '../utils/defaultData';
import { partitionIntoMergedGroups, isHoliday, isProgramActiveInWeek, isClassActiveInWeek } from '../utils/solver';
import { 
  AlertTriangle, Check, ChevronDown, Download, Grid, CalendarDays,
  Plus, ClipboardCheck, Edit, ShieldAlert, BadgeInfo, Users, BookOpen, AlertCircle
} from 'lucide-react';

interface ScheduleGridProps {
  schedule: Record<string, string[]>; // "week-day-time-room"
  setSchedule: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  classes: ClassDefinition[];
  settings: SolverSettings;
  onExportCSV: () => void;
  classOffsets?: Record<string, number>;
}

export default function ScheduleGrid({
  schedule,
  setSchedule,
  classes,
  settings,
  onExportCSV,
  classOffsets
}: ScheduleGridProps) {
  // Navigation filters
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedRoom, setSelectedRoom] = useState<string>('GILC');

  // Interactive cell override state
  const [selectedCell, setSelectedCell] = useState<{ week: number; day: string; time: string; room: string } | null>(null);
  
  // Helper to find class by ID
  const getClass = (id: string) => classes.find(c => c.id === id);

  const roomsConfig = [
    { name: 'GILC', maxClassesPerSlot: 2, maxMergedGroupsPerSlot: 2 },
    { name: 'G1', maxClassesPerSlot: 2, maxMergedGroupsPerSlot: 2 }
  ];

  const activeRoomConfig = roomsConfig.find(r => r.name === selectedRoom) || roomsConfig[0];

  // Analyze cell constraints for warnings or capacities
  const inspectCell = (week: number, day: string, time: string, roomName: string) => {
    const key = `${week}-${day}-${time}-${roomName}`;
    const classIds = schedule[key] || [];
    if (classIds.length === 0) return { error: null, warning: null, groups: [] };

    const cellClasses = classIds.map(getClass).filter(Boolean) as ClassDefinition[];
    const groups = partitionIntoMergedGroups(cellClasses, settings.levelMergeDistance, !!settings.allowGEPIgnoreSequential);

    let error: string | null = null;
    let warning: string | null = null;

    // Capacity metrics specific to this room
    if (cellClasses.length > activeRoomConfig.maxClassesPerSlot) {
      error = `Exceeds room capacity (${cellClasses.length}/${activeRoomConfig.maxClassesPerSlot})`;
    }

    if (groups.length > activeRoomConfig.maxMergedGroupsPerSlot) {
      error = `Exceeds max merged groups (${groups.length}/${activeRoomConfig.maxMergedGroupsPerSlot})`;
    }

    // Verify program rot cycles
    cellClasses.forEach(cls => {
      const activeInWeek = isClassActiveInWeek(cls, week, classOffsets, settings);
      const isAssignedToThisRoom = (settings.roomAssignments?.[cls.program] || 'GILC') === roomName;

      if (!activeInWeek) {
        warning = `Cycle Error: ${cls.program} not active in Week ${week}.`;
      } else if (!isAssignedToThisRoom) {
        warning = `Routing Error: ${cls.program} is normally assigned to ${settings.roomAssignments?.[cls.program]}.`;
      }
    });

    return { error, warning, groups };
  };

  // Render cell element
  const renderCellContent = (week: number, day: string, time: string, roomName: string) => {
    // Check if entire day is a holiday
    if (isHoliday(week, day, settings)) {
      const matchHol = (settings.holidays || []).find(h => h.week === week && h.day.toLowerCase() === day.toLowerCase());
      return (
        <div className="absolute inset-0 bg-rose-50/70 border border-rose-100 flex flex-col items-center justify-center p-2 text-center select-none overflow-hidden hover:bg-rose-100/60 transition-all">
          <span className="text-[10px] font-extrabold text-rose-700 tracking-wider uppercase block">Closed</span>
          <span className="text-[9px] text-rose-500 font-medium truncate w-full mt-0.5">{matchHol?.name || 'Holiday'}</span>
        </div>
      );
    }

    const key = `${week}-${day}-${time}-${roomName}`;
    const classIds = schedule[key] || [];
    if (classIds.length === 0) {
      return <span className="text-slate-300 text-[10px] italic select-none">Empty</span>;
    }

    const cellClasses = classIds.map(getClass).filter(Boolean) as ClassDefinition[];
    const { error, warning, groups } = inspectCell(week, day, time, roomName);

    return (
      <div className="space-y-1.5 w-full text-left">
        {/* Render merged group blocks */}
        <div className="space-y-1">
          {groups.map((group, gIdx) => {
            const programColor = group[0]?.program === 'CP' 
              ? 'bg-sky-50 text-sky-900 border border-sky-200/50 hover:bg-sky-100/70' 
              : group[0]?.program === 'YL'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/50 hover:bg-emerald-100/70'
              : 'bg-purple-50 text-purple-900 border border-purple-200/50 hover:bg-purple-100/70';

            return (
              <div 
                key={gIdx} 
                className={`text-[10px] p-1.5 rounded-lg font-medium leading-tight ${programColor} transition-all space-y-1 shadow-2xs`}
                title={`Merged Group: ${group.map(c => `${c.name} (Level ${c.level})`).join(', ')}`}
              >
                {/* Visual compact headings, join classes */}
                <div className="font-bold flex items-center gap-1">
                  <span>
                    {group.map(c => c.name.replace(/ \(AM\)| \(PM\)| \(Early\)| \(Mid\)| \(Late AM\)| \(Sat\)| \(PM Block\)| \(PM\)| \(Late PM Sec 1\)| \(Late PM Sec 2\)| \(Late PM\)| \(Eve Sec 1\)| \(Eve Sec 2\)| \(Eve\)| \(Eve Block\)| \(Eve Reg\)| \(Eve 18:00\)/g, '')).join(', ')}
                  </span>
                </div>

                {/* Show Teachers and codes details vertically inside */}
                {group.some(c => c.teacher || c.classCode) && (
                  <div className="border-t border-slate-300/30 pt-1 space-y-0.5 font-sans text-[8.5px] text-slate-500 font-normal">
                    {group.map(c => {
                      if (!c.teacher && !c.classCode) return null;
                      return (
                        <div key={c.id} className="flex justify-between items-center gap-1.5 truncate">
                          <span className="truncate font-medium">{c.teacher || 'Unassigned'}</span>
                          <span className="text-indigo-600 font-mono text-[8px] font-semibold bg-indigo-50/70 px-1 rounded">{c.classCode || ''}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Feedback Badges */}
        <div className="flex gap-1 items-center flex-wrap pt-0.5">
          {error && (
            <span className="text-[8px] bg-rose-50 text-rose-700 px-1 py-0.5 rounded font-bold flex items-center gap-0.5" title={error}>
              <AlertTriangle className="w-2.5 h-2.5" /> High Temp
            </span>
          )}
          {warning && !error && (
            <span className="text-[8px] bg-amber-50 text-amber-700 px-1 py-0.5 rounded font-semibold flex items-center gap-0.5 mt-0.5" title={warning}>
              <AlertTriangle className="w-2.5 h-2.5 text-amber-500" /> Rotation Slip
            </span>
          )}
        </div>
      </div>
    );
  };

  // Toggle class in schedule grid
  const toggleClassInSlot = (classId: string, week: number, day: string, time: string, roomName: string) => {
    const key = `${week}-${day}-${time}-${roomName}`;
    const currentList = schedule[key] || [];

    setSchedule(prev => {
      const updated = { ...prev };
      if (currentList.includes(classId)) {
        updated[key] = currentList.filter(id => id !== classId);
      } else {
        // Option checklist - check if class already exists in this week (one slot per week max)
        Object.keys(updated).forEach(k => {
          if (k.startsWith(`${week}-`)) {
            updated[k] = (updated[k] || []).filter(id => id !== classId);
          }
        });
        updated[key] = [...currentList, classId];
      }
      return updated;
    });
  };

  // Get compatible class items to display inside selected override drawer
  const getOverrideCandidates = () => {
    if (!selectedCell) return { compatible: [], alternative: [], currentSlotted: [] };
    const { week, day, time, room } = selectedCell;

    // Classes which meet on this day and at this timeslot
    const matchingTimeAndDay = classes.filter(cls => 
      cls.time === time && cls.days.includes(day)
    );

    const key = `${week}-${day}-${time}-${room}`;
    const currentSlotted = schedule[key] || [];

    const compatible: ClassDefinition[] = [];
    const alternative: ClassDefinition[] = [];

    matchingTimeAndDay.forEach(cls => {
      // Is same program cycles active on this week?
      const activeInWeek = isClassActiveInWeek(cls, week, classOffsets, settings);
      const isAssignedRoom = (settings.roomAssignments?.[cls.program] || 'GILC') === room;

      if (activeInWeek && isAssignedRoom) {
        compatible.push(cls);
      } else {
        alternative.push(cls);
      }
    });

    return { compatible, alternative, currentSlotted };
  };

  const { compatible, alternative, currentSlotted } = getOverrideCandidates();

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-100 flex flex-col h-full overflow-hidden" id="schedule-dashboard">
      {/* Schedule Tabs & Navigation Bar */}
      <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
        
        {/* Filters Panel */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Week Selector Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Week</span>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
              className="py-1.5 px-3 text-xs bg-white text-slate-800 border border-slate-200 rounded-lg outline-none font-semibold shadow-2xs"
            >
              {Array.from({ length: settings.termLengthWeeks || 10 }).map((_, idx) => {
                const w = idx + 1;
                return (
                  <option key={w} value={w}>
                    Week {w} {isHoliday(w, 'Mon', settings) || isHoliday(w, 'Wed', settings) ? ' (Holiday)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Room Selection Tabs */}
          <div className="flex bg-slate-200/50 p-1 rounded-lg">
            {roomsConfig.map(r => (
              <button
                key={r.name}
                onClick={() => setSelectedRoom(r.name)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  selectedRoom === r.name 
                    ? 'bg-white text-indigo-700 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Room {r.name}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onExportCSV}
          className="px-4 py-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
        >
          <Download className="w-3.5 h-3.5" /> Download / Copy Excel CSV
        </button>
      </div>

      {/* Grid Dashboard Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="mb-3 text-[10px] font-mono uppercase bg-indigo-50/50 text-indigo-800 border border-indigo-100/50 rounded-lg p-2.5 flex items-center justify-between">
          <span className="font-bold flex items-center gap-1">
            <BadgeInfo className="w-4 h-4 text-indigo-600" />
            Showing term schedule: Week {selectedWeek} &bull; Room {selectedRoom}
          </span>
          <span className="font-bold text-slate-500">
            Capacity Limits: {activeRoomConfig.maxClassesPerSlot} classes max per slot &bull; {activeRoomConfig.maxMergedGroupsPerSlot} merged groups max
          </span>
        </div>

        {classes.length === 0 ? (
          <div className="border-2 border-dashed border-indigo-200 bg-indigo-50/10 rounded-2xl p-10 text-center my-10 max-w-xl mx-auto space-y-4 shadow-2xs">
            <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
              <CalendarDays className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-slate-850">Ready to Schedule!</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                Your master scheduler is currently empty. Click the <strong className="text-indigo-605">"Load / Import Save"</strong> tab on the left to paste worksheet data or upload a saved <code>.csv</code> file.
              </p>
            </div>
            <div className="border-t border-indigo-100/60 pt-4 flex justify-center gap-6 text-[10.5px] text-indigo-600/70 font-semibold">
              <span>&bull; Preserves solved cycle positions</span>
              <span>&bull; Restores all scheduling configurations</span>
            </div>
          </div>
        ) : (
          <div className="border border-slate-150 rounded-xl overflow-x-auto shadow-xs">
            <table className="w-full text-xs border-collapse min-w-[850px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-150 font-extrabold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3 border-r border-slate-150 text-center w-28">Timeslot</th>
                  {VALID_DAYS.map(day => (
                    <th key={day} className="py-2.5 px-3 border-r border-slate-150 text-center w-36">
                      {day}
                      {isHoliday(selectedWeek, day, settings) && (
                        <span className="block text-[8px] text-rose-500 font-bold uppercase mt-0.5">(Holiday)</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150">
                {VALID_TIMESLOTS.map(time => (
                  <tr key={time} className="hover:bg-slate-50/30">
                    <td className="py-3 px-3 bg-slate-50/60 text-slate-700 font-mono font-bold border-r border-slate-150 text-center text-[10.5px] select-none">
                      {time}
                    </td>
                    {VALID_DAYS.map(day => (
                      <td 
                        key={day} 
                        onClick={() => setSelectedCell({ week: selectedWeek, day, time, room: selectedRoom })}
                        className="py-2 px-2 border-r border-slate-150 align-top hover:bg-slate-50/30 cursor-pointer min-h-[75px] relative transition-all"
                      >
                        {renderCellContent(selectedWeek, day, time, selectedRoom)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* OVERRIDE MODAL DRAWER */}
      {selectedCell && (
        <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  Manual Adjustments ({selectedCell.day} at {selectedCell.time})
                </h4>
                <p className="text-[10px] text-indigo-600 font-extrabold font-mono uppercase tracking-wide">
                  Week {selectedCell.week} &bull; Room {selectedCell.room}
                </p>
              </div>
              <button 
                onClick={() => setSelectedCell(null)}
                className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200/80 p-1.5 rounded-full font-bold transition-all h-7 w-7 flex items-center justify-center cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-5 text-xs text-slate-700">
              
              {/* Holiday checking */}
              {isHoliday(selectedCell.week, selectedCell.day, settings) && (
                <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 p-3 rounded-xl text-rose-800">
                  <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    This day is currently marked as a <strong>CLOSED HOLIDAY ({selectedCell.day})</strong>. You must clear the holiday in Settings first if you intend to book classes today.
                  </p>
                </div>
              )}

              {/* Info guideline */}
              <div className="flex items-start gap-2 bg-indigo-50 border border-indigo-100 p-3 rounded-xl text-indigo-900">
                <BadgeInfo className="w-4.5 h-4.5 text-indigo-600 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  Only classes scheduled on <strong>{selectedCell.day}s</strong> at <strong>{selectedCell.time}</strong> are eligible to fit their physical term slots.
                </p>
              </div>

              {/* Current Assignments */}
              <div>
                <h5 className="font-bold text-slate-900 mb-2 uppercase tracking-wider text-[10px] text-slate-400">Current Slotted Classes ({currentSlotted.length})</h5>
                {currentSlotted.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2.5 border border-dashed border-slate-200 rounded-lg text-center bg-slate-50/55">
                    No classes scheduled in this room slot yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {currentSlotted.map(id => {
                      const cls = getClass(id);
                      if (!cls) return null;
                      return (
                        <div key={id} className="flex justify-between items-center p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-lg">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2 font-semibold text-slate-900 text-xs">
                              <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                              <span>{cls.name}</span>
                              <span className="text-[10px] text-indigo-650 font-mono font-bold bg-indigo-50 px-1 rounded">{cls.classCode || 'No Code'}</span>
                            </div>
                            <span className="pl-4 text-[10px] text-slate-500">
                              Teacher: <strong className="text-slate-700">{cls.teacher || 'Unassigned'}</strong>
                            </span>
                          </div>
                          <button
                            onClick={() => toggleClassInSlot(id, selectedCell.week, selectedCell.day, selectedCell.time, selectedCell.room)}
                            className="text-xs text-red-600 hover:text-red-700 font-bold hover:bg-red-50 px-2.5 py-1 rounded transition-all cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Addable Candidates */}
              <div className="space-y-4">
                {/* Compatible Preference Match */}
                <div>
                  <h5 className="font-bold text-slate-900 mb-2 uppercase tracking-wider text-[10px] text-slate-400">Compatible Candidates (Matching Rotations in {selectedCell.room})</h5>
                  {compatible.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-1">No same-cycle matching classes teach at this time.</p>
                  ) : (
                    <div className="space-y-2">
                      {compatible.map(cls => {
                        const active = currentSlotted.includes(cls.id);
                        if (active) return null;
                        return (
                          <div key={cls.id} className="flex justify-between items-center p-2 border border-slate-100 rounded-lg hover:border-slate-300">
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-800">{cls.name}</span>
                              <span className="text-[9px] text-slate-400">L{cls.level} &bull; {cls.teacher || 'No Teacher'}</span>
                            </div>
                            <button
                              onClick={() => toggleClassInSlot(cls.id, selectedCell.week, selectedCell.day, selectedCell.time, selectedCell.room)}
                              disabled={isHoliday(selectedCell.week, selectedCell.day, settings)}
                              className="px-2.5 py-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-md transition-all cursor-pointer disabled:opacity-40"
                            >
                              Add to Slot
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Conflict / Alternative Rotation Matches */}
                <div>
                  <h5 className="font-bold text-slate-900 mb-2 uppercase tracking-wider text-[10px] text-slate-400">Alternative Candidates (Out of Rotation / Custom Routing)</h5>
                  {alternative.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-1 text-left">No remaining classes teach in this timeslot.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {alternative.map(cls => {
                        const active = currentSlotted.includes(cls.id);
                        if (active) return null;
                        return (
                          <div key={cls.id} className="flex justify-between items-center p-2 border border-slate-100 rounded-lg bg-slate-50/40">
                            <div className="flex flex-col text-slate-600">
                              <span className="font-medium">{cls.name}</span>
                              <span className="text-[9px] text-slate-400">Rotates {settings.programRotations?.[cls.program]?.frequency}w &bull; Assigned to {settings.roomAssignments?.[cls.program]}</span>
                            </div>
                            <button
                              onClick={() => toggleClassInSlot(cls.id, selectedCell.week, selectedCell.day, selectedCell.time, selectedCell.room)}
                              disabled={isHoliday(selectedCell.week, selectedCell.day, settings)}
                              className="px-2 py-1 text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-all cursor-pointer disabled:opacity-40"
                            >
                              Book Anyway (Exception)
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
              <button 
                onClick={() => setSelectedCell(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-all shadow-md cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
