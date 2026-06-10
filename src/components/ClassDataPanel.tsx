import React, { useState } from 'react';
import { ClassDefinition, SolverSettings, Program, RoomConfig, HolidayConfig, ProgramRotation } from '../types';
import { VALID_DAYS, VALID_TIMESLOTS } from '../utils/defaultData';
import { 
  Plus, Trash2, Upload, Settings2, Info, RefreshCw, Layers, Calendar, Home, AlertCircle, Sparkles
} from 'lucide-react';

interface ClassDataPanelProps {
  classes: ClassDefinition[];
  setClasses: React.Dispatch<React.SetStateAction<ClassDefinition[]>>;
  settings: SolverSettings;
  setSettings: React.Dispatch<React.SetStateAction<SolverSettings>>;
  onOptimize: () => void;
  onResetToDefault: () => void;
  isSolving: boolean;
}

export default function ClassDataPanel({
  classes,
  setClasses,
  settings,
  setSettings,
  onOptimize,
  onResetToDefault,
  isSolving
}: ClassDataPanelProps) {
  const [activeTab, setActiveTab] = useState<'classes' | 'settings' | 'import'>('classes');
  
  // States for adding a new class
  const [newClassName, setNewClassName] = useState('');
  const [newProgram, setNewProgram] = useState<Program>('CP');
  const [newLevel, setNewLevel] = useState('1');
  const [newTime, setNewTime] = useState('08:00-09:30');
  const [newDays, setNewDays] = useState<string[]>(['Mon']);
  const [newTeacher, setNewTeacher] = useState('');
  const [newClassCode, setNewClassCode] = useState('');

  // States for holiday creator
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayWeek, setNewHolidayWeek] = useState(1);
  const [newHolidayDay, setNewHolidayDay] = useState('Wed');

  // Paste import state
  const [pasteData, setPasteData] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Add individual class
  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;

    const newClass: ClassDefinition = {
      id: `${newProgram.toLowerCase()}-${newLevel.toLowerCase()}-${Date.now()}`,
      name: newClassName.trim(),
      program: newProgram,
      level: newLevel.toUpperCase().trim(),
      days: newDays,
      time: newTime,
      teacher: newTeacher.trim() || undefined,
      classCode: newClassCode.trim() || undefined
    };

    setClasses(prev => [newClass, ...prev]);
    setNewClassName('');
    setNewTeacher('');
    setNewClassCode('');
    setImportStatus(`Added class "${newClass.name}" successfully.`);
  };

  const handleToggleDay = (day: string) => {
    setNewDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleDeleteClass = (id: string) => {
    setClasses(prev => prev.filter(c => c.id !== id));
  };

  // Add a custom holiday
  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayName.trim()) return;

    const newHoliday: HolidayConfig = {
      id: `hol-${Date.now()}`,
      week: newHolidayWeek,
      day: newHolidayDay,
      name: newHolidayName.trim()
    };

    setSettings(prev => ({
      ...prev,
      holidays: [...(prev.holidays || []), newHoliday]
    }));

    setNewHolidayName('');
    setImportStatus(`Added holiday "${newHoliday.name}" for Week ${newHoliday.week} - ${newHoliday.day}.`);
  };

  const handleDeleteHoliday = (id: string) => {
    setSettings(prev => ({
      ...prev,
      holidays: (prev.holidays || []).filter(h => h.id !== id)
    }));
  };

  // Intelligent spreadsheet parser with Teacher & Section Code detection
  const handleImportPaste = () => {
    if (!pasteData.trim()) {
      setImportStatus('Please paste spreadsheet data first.');
      return;
    }

    try {
      const lines = pasteData.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        setImportStatus('Paste data is empty.');
        return;
      }

      // Detect header
      const firstLineCols = lines[0].split(/[,\t]+/).map(c => c.trim().toLowerCase());
      
      let courseNameIdx = -1;
      let classDaysIdx = -1;
      let timeIdx = -1;
      let staffNameIdx = -1;
      let classIdIdx = -1;

      // Check if first line is indeed a header
      const isHeader = firstLineCols.some(col => 
        ['coursename', 'classname', 'class name', 'course name', 'classdays', 'time', 'staffname', 'staff name', 'teacher', 'classid', 'class id', 'section code'].includes(col)
      );

      let dataLines = lines;
      if (isHeader) {
        // map columns
        firstLineCols.forEach((col, idx) => {
          if (col === 'coursename' || col === 'course name' || col === 'classname' || col === 'class name') courseNameIdx = idx;
          else if (col === 'classdays' || col === 'days' || col === 'class days') classDaysIdx = idx;
          else if (col === 'time' || col === 'timeslot') timeIdx = idx;
          else if (col === 'staffname' || col === 'staff name' || col === 'teacher') staffNameIdx = idx;
          else if (col === 'classid' || col === 'class id' || col === 'id' || col === 'section code') classIdIdx = idx;
        });
        dataLines = lines.slice(1);
      } else {
        // Default mapping based on length guess or index mappings
        const sampleCols = lines[0].split(/[,\t]+/);
        if (sampleCols.length >= 7 && /^\d+$/.test(sampleCols[0].trim())) {
          classIdIdx = 0;
          courseNameIdx = 1;
          classDaysIdx = 2;
          timeIdx = 3;
          staffNameIdx = 6;
        }
      }

      const parsedClasses: ClassDefinition[] = [];
      let parsedCount = 0;

      dataLines.forEach((line, index) => {
        if (!line.trim()) return;
        
        // Split with care (CSV might have commas or tabs)
        const columns: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if ((char === ',' || char === '\t') && !inQuotes) {
            columns.push(cur.trim());
            cur = '';
          } else {
            cur += char;
          }
        }
        columns.push(cur.trim());

        // Now extract according to mapped indexes or defaults
        let rawCourseName = '';
        let rawClassCode = '';
        let rawDays = '';
        let rawTime = '';
        let rawTeacher = '';

        if (courseNameIdx !== -1 && courseNameIdx < columns.length) {
          rawCourseName = columns[courseNameIdx].replace(/^"|"$/g, '').trim();
        }
        if (classIdIdx !== -1 && classIdIdx < columns.length) {
          rawClassCode = columns[classIdIdx].replace(/^"|"$/g, '').trim();
        }
        if (classDaysIdx !== -1 && classDaysIdx < columns.length) {
          rawDays = columns[classDaysIdx].replace(/^"|"$/g, '').trim();
        }
        if (timeIdx !== -1 && timeIdx < columns.length) {
          rawTime = columns[timeIdx].replace(/^"|"$/g, '').trim();
        }
        if (staffNameIdx !== -1 && staffNameIdx < columns.length) {
          rawTeacher = columns[staffNameIdx].replace(/^"|"$/g, '').trim();
        }

        // If indexes were not mapped (legacy sequential format)
        if (courseNameIdx === -1) {
          if (columns.length >= 4) {
            rawCourseName = columns[0].trim();
            const legacyProg = columns[1].trim();
            const legacyLevel = columns[2].trim();
            rawDays = columns[3].trim();
            rawTime = columns[4] ? columns[4].trim() : '08:00-09:30';
            rawTeacher = columns[5] ? columns[5].trim() : '';
            rawClassCode = columns[6] ? columns[6].trim() : '';
            
            rawCourseName = `${legacyProg} ${legacyLevel} ${rawCourseName}`;
          }
        }

        if (!rawCourseName) return;

        // Clean Course Name and extract Program and Level as per instructions
        const cleanedCourseStr = rawCourseName.trim();
        let program: Program = 'CP';
        if (cleanedCourseStr.toUpperCase().startsWith('CP')) program = 'CP';
        else if (cleanedCourseStr.toUpperCase().startsWith('YL')) program = 'YL';
        else if (cleanedCourseStr.toUpperCase().startsWith('GEP')) program = 'GEP';

        let levelPart = cleanedCourseStr.replace(/^(CP|YL|GEP)/i, '')
                                .replace(/Level/gi, '')
                                .replace(/Plus/gi, '')
                                .trim();
        const match = levelPart.match(/(\d+\s*[A-Z]?|\d+)/i);
        let level = '1';
        if (match) {
          level = match[0].replace(/\s+/g, '').toUpperCase();
        } else {
          level = levelPart || '1';
        }

        const cleanDays = rawDays
          .split(/[\/, ]+/)
          .map(d => d.trim())
          .filter(d => VALID_DAYS.includes(d));

        let formattedTime = rawTime;
        const cleanTime = rawTime.replace(/:/g, '').trim();
        if (/^\d+$/.test(cleanTime)) {
          const padded = cleanTime.padStart(8, '0');
          const startH = padded.substring(0, 2);
          const startM = padded.substring(2, 4);
          const endH = padded.substring(4, 6);
          const endM = padded.substring(6, 8);
          formattedTime = `${startH}:${startM}-${endH}:${endM}`;
        }

        if (cleanDays.length > 0) {
          parsedClasses.push({
            id: `c-${rawClassCode || `${program.toLowerCase()}-${level.toLowerCase()}-${index}-${Date.now()}`}`,
            name: rawCourseName,
            program,
            level,
            days: cleanDays,
            time: formattedTime,
            teacher: rawTeacher || undefined,
            classCode: rawClassCode || undefined
          });
          parsedCount++;
        }
      });

      if (parsedClasses.length > 0) {
        setClasses(parsedClasses);
        setPasteData('');
        setImportStatus(`Success! Parsed and loaded ${parsedCount} classes with high-fidelity attributes.`);
        setActiveTab('classes');
      } else {
        setImportStatus('Could not parse any classes. Verify the format has CourseName and ClassDays info.');
      }
    } catch (err) {
      setImportStatus('Error parsing CSV columns: ' + (err as Error).message);
    }
  };

  // High-fidelity schedule CSV import "load a save" feature
  const parseAndLoadExportedCSV = (csvText: string) => {
    try {
      const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length <= 1) {
        setImportStatus('The uploaded CSV file is empty or has no data rows.');
        return;
      }

      const header = lines[0].toLowerCase();
      if (!header.includes('timeslot') || !header.includes('class name') || !header.includes('teacher')) {
        setImportStatus('Invalid save format. Please upload a CSV that was exported directly from this planner.');
        return;
      }

      // Restore settings metadata if embedded at the bottom of the CSV backup save
      const startIdx = csvText.indexOf('#SETTINGS_METADATA_START#');
      const endIdx = csvText.indexOf('#SETTINGS_METADATA_END#');
      let customImportedSettings: any = null;
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const metadataBlock = csvText.substring(startIdx, endIdx);
        const metaLine = metadataBlock.split('\n').find(l => {
          const trimmed = l.trim();
          return trimmed.startsWith('#') && !trimmed.includes('METADATA');
        });
        if (metaLine) {
          try {
            const cleanJSON = metaLine.replace(/^#/, '').trim();
            const parsedMetaSettings = JSON.parse(cleanJSON);
            if (parsedMetaSettings && typeof parsedMetaSettings === 'object') {
              customImportedSettings = parsedMetaSettings;
              setSettings(prev => ({
                ...prev,
                ...parsedMetaSettings
              }));
            }
          } catch (e) {
            console.warn('Could not restore rule configurations from database backup metadata', e);
          }
        }
      }

      const classMap = new Map<string, {
        name: string;
        program: Program;
        level: string;
        days: Set<string>;
        time: string;
        teacher?: string;
        classCode?: string;
      }>();

      const classActiveWeeks = new Map<string, Set<number>>();

      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };

      const parseLevelFromName = (name: string, program: Program): string => {
        const upper = name.toUpperCase();
        const match = upper.match(new RegExp(`${program}\\s*([0-9]+[A-Z]?)`));
        if (match && match[1]) {
          return match[1];
        }
        const fallbackMatch = upper.match(/([0-9]+[A-Z]?)/);
        if (fallbackMatch && fallbackMatch[1]) {
          return fallbackMatch[1];
        }
        return '1';
      };

      for (let index = 1; index < lines.length; index++) {
        const line = lines[index];
        
        // Skip comment metadata lines
        if (line.startsWith('#')) {
          continue;
        }

        const parts = parseCSVLine(line);
        if (parts.length < 5) continue;

        const weekStr = parts[0];
        const weekNum = parseInt(weekStr.replace(/\D/g, '')) || 1;
        const day = parts[2];
        const timeslot = parts[3];
        const classNamesStr = parts[4].replace(/^"|"$/g, '').trim();
        const teachersStr = parts.length > 5 ? parts[5].replace(/^"|"$/g, '').trim() : '';
        const sectionCodesStr = parts.length > 6 ? parts[6].replace(/^"|"$/g, '').trim() : '';

        if (!classNamesStr) continue;

        const names = classNamesStr.split(',').map(s => s.trim());
        const teachers = teachersStr.split(',').map(s => s.trim());
        const codes = sectionCodesStr.split(',').map(s => s.trim());

        for (let idx = 0; idx < names.length; idx++) {
          const name = names[idx];
          if (!name) continue;

          const teacher = teachers[idx] === 'N/A' || !teachers[idx] ? '' : teachers[idx];
          const code = codes[idx] === 'N/A' || !codes[idx] ? '' : codes[idx];

          const uniqueKey = code ? code : `${name}_${timeslot}`;
          
          if (!classMap.has(uniqueKey)) {
            let program: Program = 'CP';
            if (name.toUpperCase().startsWith('CP')) program = 'CP';
            else if (name.toUpperCase().startsWith('YL')) program = 'YL';
            else if (name.toUpperCase().startsWith('GEP')) program = 'GEP';

            const level = parseLevelFromName(name, program);

            classMap.set(uniqueKey, {
              name,
              program,
              level,
              days: new Set<string>([day]),
              time: timeslot,
              teacher: teacher || undefined,
              classCode: code || undefined
            });
          } else {
            const existing = classMap.get(uniqueKey)!;
            existing.days.add(day);
          }

          if (!classActiveWeeks.has(uniqueKey)) {
            classActiveWeeks.set(uniqueKey, new Set<number>());
          }
          classActiveWeeks.get(uniqueKey)!.add(weekNum);
        }
      }

      if (classMap.size === 0) {
        setImportStatus('No valid classes found in the save file.');
        return;
      }

      const reconstructedClasses: ClassDefinition[] = Array.from(classMap.entries()).map(([key, item]) => {
        let offset = 0;
        const activeWeeks = classActiveWeeks.get(key);
        if (activeWeeks && activeWeeks.size > 0) {
          const minWeek = Math.min(...Array.from(activeWeeks));
          const defaultRotations = { CP: 1, YL: 1, GEP: 1 };
          const activeSettings = customImportedSettings || settings;
          const freq = activeSettings.programRotations?.[item.program]?.frequency ?? defaultRotations[item.program] ?? 1;
          offset = (minWeek - 1) % freq;
        }

        return {
          id: `c-${item.classCode || key.replace(/\s+/g, '-')}`,
          name: item.name,
          program: item.program,
          level: item.level,
          days: Array.from(item.days),
          time: item.time,
          teacher: item.teacher,
          classCode: item.classCode,
          offset
        };
      });

      setClasses(reconstructedClasses);
      setPasteData('');
      setImportStatus(`Success! Restored master schedule save: Loaded ${reconstructedClasses.length} unique active classes.`);
      setActiveTab('classes');
    } catch (err) {
      setImportStatus('Error loading CSV save: ' + (err as Error).message);
    }
  };

  const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      parseAndLoadExportedCSV(text);
    };
    reader.readAsText(file);
  };

  // Helper to change rotation frequency/offset for a program
  const handleUpdateProgramRotation = (program: Program, key: keyof ProgramRotation, value: number) => {
    const defaultRotations = {
      CP: { frequency: 2, offset: 0 },
      YL: { frequency: 2, offset: 0 },
      GEP: { frequency: 2, offset: 1 }
    };
    const currentRotations = settings.programRotations || defaultRotations;
    const currentRot = currentRotations[program] || defaultRotations[program];
    
    setSettings(prev => ({
      ...prev,
      programRotations: {
        ...currentRotations,
        [program]: {
          ...currentRot,
          [key]: value
        }
      }
    }));
  };

  // Helper to change room assignment for a program
  const handleUpdateProgramRoom = (program: Program, roomName: string) => {
    const defaultAssignments = { CP: 'GILC', YL: 'GILC', GEP: 'GILC' };
    const currentAssignments = settings.roomAssignments || defaultAssignments;

    setSettings(prev => ({
      ...prev,
      roomAssignments: {
        ...currentAssignments,
        [program]: roomName
      }
    }));
  };

  // Helper to update capacity values of a specific room
  const handleUpdateRoomCapacity = (roomName: string, key: 'maxClassesPerSlot' | 'maxMergedGroupsPerSlot', value: number) => {
    const defaultRooms = [
      { name: 'GILC', maxClassesPerSlot: settings.maxClassesPerSlot || 4, maxMergedGroupsPerSlot: settings.maxMergedGroupsPerSlot || 2 },
      { name: 'G1', maxClassesPerSlot: 2, maxMergedGroupsPerSlot: 1 }
    ];
    const currentRooms = settings.rooms || defaultRooms;

    const updatedRooms = currentRooms.map(r => {
      if (r.name === roomName) {
        return { ...r, [key]: value };
      }
      return r;
    });

    setSettings(prev => ({
      ...prev,
      rooms: updatedRooms,
      // Mirror primary room GILC back to legacy props to ensure full robust backward safety
      maxClassesPerSlot: roomName === 'GILC' && key === 'maxClassesPerSlot' ? value : prev.maxClassesPerSlot,
      maxMergedGroupsPerSlot: roomName === 'GILC' && key === 'maxMergedGroupsPerSlot' ? value : prev.maxMergedGroupsPerSlot
    }));
  };

  const rooms = settings.rooms || [
    { name: 'GILC', maxClassesPerSlot: settings.maxClassesPerSlot || 4, maxMergedGroupsPerSlot: settings.maxMergedGroupsPerSlot || 2 },
    { name: 'G1', maxClassesPerSlot: 2, maxMergedGroupsPerSlot: 1 }
  ];

  const rotations = settings.programRotations || {
    CP: { frequency: 2, offset: 0 },
    YL: { frequency: 2, offset: 0 },
    GEP: { frequency: 2, offset: 1 }
  };

  const roomAssignments = settings.roomAssignments || {
    CP: 'GILC',
    YL: 'GILC',
    GEP: 'GILC'
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-100 flex flex-col h-full overflow-hidden" id="class-data-panel">
      {/* Tab bar header */}
      <div className="flex border-b border-slate-100 bg-slate-50/50">
        <button
          onClick={() => setActiveTab('classes')}
          className={`flex-1 py-3 px-4 text-xs font-semibold border-b-2 text-center transition-all ${
            activeTab === 'classes'
              ? 'border-indigo-600 text-indigo-600 bg-white'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          id="tab-classes"
        >
          Classes ({classes.length})
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 py-3 px-4 text-xs font-semibold border-b-2 text-center transition-all ${
            activeTab === 'settings'
              ? 'border-indigo-600 text-indigo-600 bg-white'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          id="tab-settings"
        >
          Scheduling Rules & Infrastructure
        </button>
        <button
          onClick={() => setActiveTab('import')}
          className={`flex-1 py-3 px-4 text-xs font-semibold border-b-2 text-center transition-all ${
            activeTab === 'import'
              ? 'border-indigo-600 text-indigo-600 bg-white'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          id="tab-import"
        >
          Load / Import Save
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {importStatus && (
          <div className="p-3 bg-emerald-50 text-emerald-800 text-[11px] rounded-lg flex items-center gap-2 border border-emerald-100 animate-fadeIn">
            <Info className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
            <span>{importStatus}</span>
            <button className="ml-auto font-bold opacity-70 hover:opacity-100" onClick={() => setImportStatus(null)}>×</button>
          </div>
        )}

        {/* TAB 1: CLASSES LIST & ADDER */}
        {activeTab === 'classes' && (
          <div className="space-y-5">
            {/* Quick Adder Form */}
            <form onSubmit={handleAddClass} className="p-4 bg-indigo-50/30 rounded-xl border border-indigo-100/50 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-950 flex items-center gap-1.5 pb-1 border-b border-indigo-150/50">
                <Plus className="w-3.5 h-3.5 text-indigo-600" /> Create Class Register
              </h4>
              <div className="grid grid-cols-6 gap-3">
                <div className="col-span-3">
                  <label className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400">Class Name</label>
                  <input
                    type="text"
                    required
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="e.g. CP 3 (AM)"
                    className="w-full mt-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-indigo-600 bg-white text-slate-800"
                  />
                </div>
                <div className="col-span-1.5">
                  <label className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400">Program</label>
                  <select
                    value={newProgram}
                    onChange={(e) => {
                      const prog = e.target.value as Program;
                      setNewProgram(prog);
                      if (prog === 'GEP') setNewLevel('11A');
                      else setNewLevel('1');
                    }}
                    className="w-full mt-1 px-1.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-800 outline-none"
                  >
                    <option value="CP">CP</option>
                    <option value="YL">YL</option>
                    <option value="GEP">GEP</option>
                  </select>
                </div>
                <div className="col-span-1.5">
                  <label className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400">Level</label>
                  {newProgram === 'GEP' ? (
                    <select
                      value={newLevel}
                      onChange={(e) => setNewLevel(e.target.value)}
                      className="w-full mt-1 px-1.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-800 outline-none"
                    >
                      <option value="11A">11A</option>
                      <option value="11B">11B</option>
                      <option value="12">12</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      value={newLevel}
                      onChange={(e) => setNewLevel(e.target.value)}
                      placeholder="3"
                      className="w-full mt-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-indigo-600 bg-white text-slate-800"
                    />
                  )}
                </div>
              </div>

              {/* Extra Meta Grid (Teacher & Code) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400">Teacher Name (Optional)</label>
                  <input
                    type="text"
                    value={newTeacher}
                    onChange={(e) => setNewTeacher(e.target.value)}
                    placeholder="e.g. David Miller"
                    className="w-full mt-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-indigo-600 bg-white text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400">Class Section Code (Optional)</label>
                  <input
                    type="text"
                    value={newClassCode}
                    onChange={(e) => setNewClassCode(e.target.value)}
                    placeholder="e.g. CP3-AM-B"
                    className="w-full mt-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-indigo-600 bg-white text-slate-800"
                  />
                </div>
              </div>

              {/* Timeslot & Days selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400">Regular Timeslot</label>
                  <select
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full mt-1 py-1.5 px-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-800 outline-none"
                  >
                    {VALID_TIMESLOTS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400">Meeting Days</label>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {VALID_DAYS.map(day => {
                      const active = newDays.includes(day);
                      return (
                        <button
                          type="button"
                          key={day}
                          onClick={() => handleToggleDay(day)}
                          className={`px-2 py-1 font-mono text-[9px] rounded font-bold border transition-all cursor-pointer ${
                            active 
                              ? 'bg-indigo-600 border-indigo-600 text-white' 
                              : 'bg-white border-slate-205 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          {day.substring(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all mt-3 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Save Class Definition
              </button>
            </form>

            {/* Classes List Table view */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Configured Term Register ({classes.length})</span>
                <button 
                  onClick={onResetToDefault}
                  className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition-all border border-slate-200 rounded-md py-1 px-2.5 bg-slate-50 cursor-pointer hover:bg-white"
                >
                  <RefreshCw className="w-3 h-3" /> Reset default data
                </button>
              </div>

              {classes.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <p className="text-xs text-slate-400">No classes configured. Use Paste Spreadsheet to run immediately!</p>
                </div>
              ) : (
                <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[400px] overflow-y-auto shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 border-b border-slate-100 font-extrabold text-[9px] uppercase tracking-wider">
                        <th className="py-2.5 px-3">Class</th>
                        <th className="py-2.5 px-3">Details</th>
                        <th className="py-2.5 px-3">Regular Pattern</th>
                        <th className="py-2.5 px-3 text-right">Delete</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {classes.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50/50 text-slate-700">
                          <td className="py-2 px-3">
                            <div className="font-semibold text-slate-900 leading-tight">{c.name}</div>
                            {c.classCode && (
                              <div className="text-[9px] text-slate-400 font-mono mt-0.5">Code: {c.classCode}</div>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex self-start items-center px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                                c.program === 'CP' 
                                  ? 'bg-sky-50 text-sky-800 border class border-sky-100'
                                  : c.program === 'YL'
                                  ? 'bg-emerald-50 text-emerald-800 border class border-emerald-100'
                                  : 'bg-purple-50 text-purple-800 border class border-purple-100'
                              }`}>
                                {c.program} L{c.level}
                              </span>
                              {c.teacher && (
                                <span className="text-[9px] text-slate-500 italic block">Teacher: {c.teacher}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-mono text-[11px] text-slate-500 py-0.5 font-semibold">{c.days.join('/')}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{c.time}</div>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => handleDeleteClass(c.id)}
                              className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ADVANCED RULE SETTINGS (Multi-Room, Cycle Frequencies, Holidays) */}
        {activeTab === 'settings' && (
          <div className="space-y-6" id="settings-view">
            {/* Header */}
            <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <Settings2 className="w-4.5 h-4.5 text-indigo-600" />
              <h4 className="text-xs font-bold text-slate-950 uppercase tracking-wider">
                Full-Term Rotation & Room Infrastructure
              </h4>
            </div>

            {/* Section 2.1: Multi-room Configuration Panel */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h5 className="text-[11px] font-bold text-indigo-950 uppercase tracking-widest flex items-center gap-1.5">
                  <Home className="w-4 h-4 text-indigo-600" /> Infrastructure Rooms & Capacity Limits
                </h5>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 font-mono block">Multi-Room Active</span>
              </div>
              
              <div className="space-y-4 divide-y divide-slate-150/60">
                {rooms.map(room => (
                  <div key={room.name} className="pt-3 first:pt-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full inline-block"></span>
                        Room: {room.name}
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded font-mono font-extrabold border">
                        Max: 2 Classes / Slot
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Physical constraints limit this facility space to a maximum of 2 classes and 2 merged levels per timeslot.
                    </p>
                  </div>
                ))}
              </div>
            </div>
            {/* Section 2.2: Program Cycles and Rotations */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-4">
              <h5 className="text-[11px] font-bold text-indigo-950 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <Layers className="w-4 h-4 text-indigo-600" /> Program Cycle & Room Allocations
              </h5>
              
              <div className="space-y-4 divide-y divide-slate-150/60">
                {(['CP', 'YL', 'GEP'] as Program[]).map(prog => {
                  const rot = rotations[prog] || { frequency: 1, offset: 0 };
                  const room = roomAssignments[prog] || 'GILC';
                  
                  return (
                    <div key={prog} className="pt-3 first:pt-0 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded border ${
                          prog === 'CP' 
                            ? 'bg-sky-50 border-sky-200 text-sky-800' 
                             : prog === 'YL' 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                            : 'bg-purple-50 border-purple-200 text-purple-800'
                        }`}>
                          {prog === 'CP' ? 'CP program' : prog === 'YL' ? 'YL program' : 'GEP program'}
                        </span>
                        
                        <span className="text-[10px] text-slate-400">
                          Scheduled: Every {rot.frequency} weeks
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* 1. Cycle selection */}
                        <div>
                          <label className="text-[9px] uppercase font-extrabold text-slate-500">GILC Cycle Frequency</label>
                          <select
                            value={rot.frequency}
                            onChange={(e) => handleUpdateProgramRotation(prog, 'frequency', parseInt(e.target.value))}
                            className="w-full mt-1 border border-slate-200 rounded-lg p-1.5 text-xs bg-white text-slate-800 outline-none"
                          >
                            <option value="1">Weekly (Every Week)</option>
                            <option value="2">Bi-Weekly (Every 2w)</option>
                            <option value="3">Tri-Weekly (Every 3w)</option>
                            <option value="4">Quad-Weekly (Every 4w)</option>
                          </select>
                        </div>

                        {/* 2. Manual Room assignment */}
                        <div>
                          <label className="text-[9px] uppercase font-extrabold text-slate-500">Facility Room</label>
                          <select
                            value={room}
                            onChange={(e) => handleUpdateProgramRoom(prog, e.target.value)}
                            className="w-full mt-1 border border-slate-200 rounded-lg p-1.5 text-xs bg-white text-indigo-750 font-bold outline-none"
                          >
                            {rooms.map(r => (
                              <option key={r.name} value={r.name}>{r.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-400 px-1 italic">
                        Active weeks: {Array.from({ length: 10 }).map((_, i) => {
                          const w = 1 + (i * rot.frequency);
                          return w <= (settings.termLengthWeeks || 10) ? w : null;
                        }).filter(Boolean).sort((a,b) => a! - b!).join(', ')}... In room {room}.
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 2.3: General Settings / Term lengths */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
              <h5 className="text-[11px] font-bold text-slate-800 uppercase tracking-widest block pb-1 border-b border-slate-200">
                General Term Properties
              </h5>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block">Term Duration (Weeks)</label>
                  <input
                    type="number"
                    min="4"
                    max="16"
                    value={settings.termLengthWeeks || 10}
                    onChange={(e) => setSettings(prev => ({ ...prev, termLengthWeeks: parseInt(e.target.value) || 10 }))}
                    className="mt-1 w-full border border-slate-200 rounded-lg py-1.5 px-3 text-xs bg-white text-slate-800 font-mono text-center"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block">Term Base Start Date</label>
                  <input
                    type="date"
                    value={settings.startDate || '2026-06-15'}
                    onChange={(e) => setSettings(prev => ({ ...prev, startDate: e.target.value }))}
                    className="mt-1 w-full border border-slate-200 rounded-lg py-1 px-2.5 text-xs bg-white text-slate-800 text-center font-mono"
                  />
                </div>
              </div>

              {/* GEP Sequential Rule Toggle */}
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                <div className="space-y-0.5">
                  <label htmlFor="gep-seq-override" className="text-xs font-bold text-slate-700 cursor-pointer block">
                    Allow GEP Levels to Ignore Sequential Rule
                  </label>
                  <span className="text-[10px] text-slate-400 block leading-tight">
                    Highly active GEP levels (11A, 11B, 12) can schedule together in 1 room regardless of gap.
                  </span>
                </div>
                <input
                  id="gep-seq-override"
                  type="checkbox"
                  checked={!!settings.allowGEPIgnoreSequential}
                  onChange={(e) => setSettings(prev => ({ ...prev, allowGEPIgnoreSequential: e.target.checked }))}
                  className="w-4.5 h-4.5 accent-indigo-600 rounded cursor-pointer"
                />
              </div>
            </div>

            {/* Section 2.4: Holidays / Excluded Dates */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h5 className="text-[11px] font-bold text-indigo-950 uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-rose-500" /> Holiday Exclusions & Closure Days
                </h5>
                <span className="text-[10px] font-extrabold text-rose-500 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded font-mono">
                  {(settings.holidays || []).length} registered
                </span>
              </div>

              {/* Holiday list */}
              {(settings.holidays || []).length > 0 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-150 max-h-40 overflow-y-auto bg-white">
                  {(settings.holidays || []).map(h => (
                    <div key={h.id} className="p-2 flex justify-between items-center text-xs text-slate-700 font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
                        <strong className="text-slate-900">{h.name}</strong>
                        <span className="text-slate-400 font-mono text-[10px]">(W{h.week} {h.day})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteHoliday(h.id)}
                        className="text-slate-400 hover:text-red-500 px-1 py-0.5 rounded hover:bg-red-50 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 border border-dashed border-slate-200 rounded-lg text-center bg-white">
                  <p className="text-xs text-slate-400 italic">No holidays configured yet. Place closures below:</p>
                </div>
              )}

              {/* Add Holiday Mini-Form */}
              <form onSubmit={handleAddHoliday} className="grid grid-cols-12 gap-2 pt-2 border-t border-slate-150">
                <div className="col-span-6">
                  <input
                    type="text"
                    required
                    value={newHolidayName}
                    onChange={(e) => setNewHolidayName(e.target.value)}
                    placeholder="e.g. Midterm Break / Closed"
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-800"
                  />
                </div>
                <div className="col-span-2">
                  <select
                    value={newHolidayWeek}
                    onChange={(e) => setNewHolidayWeek(parseInt(e.target.value))}
                    className="w-full py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 text-center font-mono"
                  >
                    {Array.from({ length: settings.termLengthWeeks || 10 }).map((_, i) => (
                      <option key={i} value={i + 2}>W{i + 2}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <select
                    value={newHolidayDay}
                    onChange={(e) => setNewHolidayDay(e.target.value)}
                    className="w-full py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 text-center"
                  >
                    {VALID_DAYS.map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <button
                    type="submit"
                    className="w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: LOAD SAVE & SYSTEM IMPORT */}
        {activeTab === 'import' && (
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-widest flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-indigo-600 animate-bounce" /> Option A: Spreadsheet Clipboard Paste
              </h4>
              <p className="text-xs text-slate-500 leading-normal mt-1.5 mb-3">
                Copy columns of data in your Google Sheets and paste them below directly. Supported column ordering (including headers):
                <br />
                <code className="text-[10px] font-mono bg-slate-100 text-indigo-700 px-1.5 py-0.5 rounded mt-1.5 block leading-normal border">
                  Class Name, Program, Level, Days, Timeslot, [Teacher], [Class Code]
                </code>
              </p>

              <textarea
                value={pasteData}
                onChange={(e) => setPasteData(e.target.value)}
                placeholder="e.g.&#10;CP 1 (AM)	CP	1	Mon	08:00-09:30	Sarah Jenkins	CP1-M-A&#10;CP 2 (AM)	CP	2	Mon	08:00-09:30	David Miller	CP2-M-A&#10;GEP 11A	GEP	11A	Mon	08:00-09:30	John Doe	GEP-A12"
                rows={6}
                className="w-full border border-slate-200 rounded-xl p-3 font-mono text-xs bg-slate-50 focus:bg-white text-slate-850 placeholder-slate-400 focus:outline-indigo-600"
              />

              <button
                onClick={handleImportPaste}
                className="w-full mt-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer"
              >
                Parse & Overwrite Current Register
              </button>
            </div>

            {/* OPTION B: LOCAL BACKUP RESCUE FILE */}
            <div className="border-t border-slate-200/80 pt-5">
              <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" /> Option B: Load Backup Save (.CSV file)
              </h4>
              <p className="text-xs text-slate-500 leading-normal mt-1.5 mb-3">
                Download your facilities schedule anytime by clicking <strong>"Download / Copy Excel CSV"</strong>. 
                Select or drop that exported <code>.csv</code> file below to instantly recreate your exact configurations and restore your offline save:
              </p>

              <label className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/15 hover:bg-indigo-50/30 p-5 rounded-xl cursor-pointer transition-all border-spacing-2">
                <Upload className="w-6 h-6 text-indigo-600 mb-1.5 animate-pulse" />
                <span className="text-xs font-bold text-indigo-800">Browse Saved CSV File</span>
                <span className="text-[10px] text-slate-400 mt-1 font-medium font-sans">Restores gilc_multi_room_schedule.csv saves</span>
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleCSVFileChange}
                  className="hidden" 
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER OPTIMIZE TRIGGER */}
      <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
        <button
          onClick={onOptimize}
          disabled={isSolving || classes.length === 0}
          className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 cursor-pointer text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition-all"
          id="btn-run-optimizer"
        >
          {isSolving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" /> Resolving constraints & rotations...
            </>
          ) : (
            <>
              <Settings2 className="w-4 h-4" /> Optimise Facility Scheduling
            </>
          )}
        </button>
      </div>
    </div>
  );
}
