import { ClassDefinition, SolverSettings, Program, SolverResult } from '../types';

// Converts levels to integers for comparison
export function getLevelSequence(program: Program, level: string): number {
  if (program === 'GEP') {
    const l = level.trim().toUpperCase();
    if (l === '11A') return 1;
    if (l === '11B') return 2;
    if (l === '12') return 3;
    return parseInt(l) || 0;
  }
  // Remove non-digits for fallback
  const numericStr = level.replace(/\D/g, '');
  return parseInt(numericStr) || 0;
}

// Compute level difference between two classes
export function getLevelDistance(classA: ClassDefinition, classB: ClassDefinition): number {
  if (classA.program !== classB.program) return 999; // Different programs cannot merge
  const seqA = getLevelSequence(classA.program, classA.level);
  const seqB = getLevelSequence(classB.program, classB.level);
  return Math.abs(seqA - seqB);
}

// Partitions a list of classes scheduled in the same slot into merged groups.
export function partitionIntoMergedGroups(
  classesInSlot: ClassDefinition[],
  levelMergeDistance: number = 1,
  allowGEPIgnoreSequential: boolean = false
): ClassDefinition[][] {
  if (classesInSlot.length === 0) return [];

  // Group classes by program
  const byProgram: Record<Program, ClassDefinition[]> = {
    CP: [],
    YL: [],
    GEP: []
  };

  classesInSlot.forEach(cls => {
    if (byProgram[cls.program]) {
      byProgram[cls.program].push(cls);
    }
  });

  const allMergedGroups: ClassDefinition[][] = [];

  (Object.keys(byProgram) as Program[]).forEach(prog => {
    const list = byProgram[prog];
    if (list.length === 0) return;

    if (prog === 'GEP' && allowGEPIgnoreSequential) {
      allMergedGroups.push(list);
      return;
    }

    const visited = new Set<string>();
    
    list.forEach(startNode => {
      if (visited.has(startNode.id)) return;

      const component: ClassDefinition[] = [];
      const queue = [startNode];
      visited.add(startNode.id);

      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);

        list.forEach(otherNode => {
          if (!visited.has(otherNode.id)) {
            const canMergeWithComponent = component.every(
              compNode => getLevelDistance(compNode, otherNode) <= levelMergeDistance
            );

            if (canMergeWithComponent) {
              visited.add(otherNode.id);
              queue.push(otherNode);
            }
          }
        });
      }

      allMergedGroups.push(component);
    });
  });

  return allMergedGroups;
}

// Check if a specific class program is active on a given week
export function isProgramActiveInWeek(
  program: Program,
  week: number,
  settings: SolverSettings
): boolean {
  const defaultRotations = {
    CP: { frequency: 1, offset: 0 },
    YL: { frequency: 1, offset: 0 },
    GEP: { frequency: 1, offset: 0 }
  };
  const rotations = settings.programRotations || defaultRotations;
  const rot = rotations[program] || defaultRotations[program];
  
  // rotation calculation from starting week 1 (no offsets needed)
  const basis = week - 1;
  if (basis < 0) return false;
  return basis % rot.frequency === 0;
}

// Check if a specific class is active on a given week based on its custom offset
export function isClassActiveInWeek(
  cls: ClassDefinition,
  week: number,
  classOffsets: Record<string, number> | undefined,
  settings: SolverSettings
): boolean {
  const defaultRotations = {
    CP: { frequency: 1, offset: 0 },
    YL: { frequency: 1, offset: 0 },
    GEP: { frequency: 1, offset: 0 }
  };
  const rotations = settings.programRotations || defaultRotations;
  const rot = rotations[cls.program] || defaultRotations[cls.program];
  const F = rot.frequency || 1;
  const O = classOffsets?.[cls.id] ?? 0;
  
  const basis = week - 1;
  if (basis < 0) return false;
  return basis % F === O;
}

// Check if there is an holiday on a given week and day
export function isHoliday(
  week: number,
  day: string,
  settings: SolverSettings
): boolean {
  if (!settings.holidays) return false;
  return settings.holidays.some(
    h => h.week === week && h.day.toLowerCase() === day.toLowerCase()
  );
}

// Run the inner core of the solver for a fixed class offset assignment
export function solveWithFixedOffsets(
  classes: ClassDefinition[],
  settings: SolverSettings,
  offsets: Record<string, number>
): SolverResult {
  const schedule: Record<string, string[]> = {};
  
  const rooms = [
    { name: 'GILC', maxClassesPerSlot: 2, maxMergedGroupsPerSlot: 2 },
    { name: 'G1', maxClassesPerSlot: 2, maxMergedGroupsPerSlot: 2 }
  ];

  const defaultAssignments = { CP: 'GILC', YL: 'GILC', GEP: 'G1' };
  const roomAssignments = settings.roomAssignments || defaultAssignments;

  const termWeeks = settings.termLengthWeeks || 10;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const timeslots = Array.from(new Set(classes.map(c => c.time))).sort();

  for (let w = 1; w <= termWeeks; w++) {
    days.forEach(day => {
      timeslots.forEach(time => {
        rooms.forEach(room => {
          schedule[`${w}-${day}-${time}-${room.name}`] = [];
        });
      });
    });
  }

  const unscheduledDiagnostics: Array<{ week: number; room: string; class: ClassDefinition }> = [];

  const sortedClasses = [...classes].sort((a, b) => {
    const slotsA = a.days.length;
    const slotsB = b.days.length;
    if (slotsA !== slotsB) return slotsA - slotsB;
    return a.program.localeCompare(b.program);
  });

  for (let w = 1; w <= termWeeks; w++) {
    rooms.forEach(room => {
      const activeClassesInRoom = sortedClasses.filter(cls => {
        const assignedRoom = roomAssignments[cls.program] || 'GILC';
        if (assignedRoom !== room.name) return false;
        return isClassActiveInWeek(cls, w, offsets, settings);
      });

      if (activeClassesInRoom.length === 0) return;

      const localSchedule: Record<string, string[]> = {};
      days.forEach(d => {
        timeslots.forEach(t => {
          localSchedule[`${d}-${t}`] = [];
        });
      });

      function canPlaceInWeekRoom(cls: ClassDefinition, day: string, time: string): boolean {
        if (isHoliday(w, day, settings)) return false;

        const slotKey = `${day}-${time}`;
        const existingIds = localSchedule[slotKey] || [];

        if (existingIds.length >= 2) {
          return false;
        }

        const currentClasses = existingIds.map(id => classes.find(c => c.id === id)!);
        const hypotheticalList = [...currentClasses, cls];

        // 1. Cross-program rule: Programs must NEVER mix in the same slot and room
        for (let i = 0; i < hypotheticalList.length; i++) {
          for (let j = i + 1; j < hypotheticalList.length; j++) {
            if (hypotheticalList[i].program !== hypotheticalList[j].program) {
              return false;
            }
          }
        }

        // 2. Enforce sequential level rule (+-1 level) for same program in same slot
        // exception: GEP ignores sequential rule if settings.allowGEPIgnoreSequential is enabled
        const isGEPOnly = hypotheticalList.every(c => c.program === 'GEP');
        const ignoreSeq = isGEPOnly && !!settings.allowGEPIgnoreSequential;

        if (!ignoreSeq) {
          for (let i = 0; i < hypotheticalList.length; i++) {
            for (let j = i + 1; j < hypotheticalList.length; j++) {
              if (getLevelDistance(hypotheticalList[i], hypotheticalList[j]) > settings.levelMergeDistance) {
                return false;
              }
            }
          }
        }

        // 3. Merged groups rule: Must keep segments unified as exactly 1 group in the room/slot
        const mergedGroups = partitionIntoMergedGroups(
          hypotheticalList, 
          settings.levelMergeDistance,
          !!settings.allowGEPIgnoreSequential
        );

        if (mergedGroups.length > 1) {
          return false;
        }

        return true;
      }

      let backtrackCount = 0;
      const MAX_BACKTRACKS_LOCAL = 200;

      function backtrackLocal(classIdx: number): boolean {
        if (classIdx >= activeClassesInRoom.length) {
          return true;
        }
        if (backtrackCount > MAX_BACKTRACKS_LOCAL) {
          return false;
        }

        const cls = activeClassesInRoom[classIdx];

        for (const day of cls.days) {
          if (canPlaceInWeekRoom(cls, day, cls.time)) {
            const slotKey = `${day}-${cls.time}`;
            localSchedule[slotKey].push(cls.id);

            if (backtrackLocal(classIdx + 1)) {
              return true;
            }

            backtrackCount++;
            const idx = localSchedule[slotKey].indexOf(cls.id);
            if (idx > -1) {
              localSchedule[slotKey].splice(idx, 1);
            }
          }
        }

        return false;
      }

      const perfectFound = backtrackLocal(0);

      if (perfectFound) {
        days.forEach(d => {
          timeslots.forEach(t => {
            const key = `${w}-${d}-${t}-${room.name}`;
            schedule[key] = [...localSchedule[`${d}-${t}`]];
          });
        });
      } else {
        days.forEach(d => {
          timeslots.forEach(t => {
            localSchedule[`${d}-${t}`] = [];
          });
        });

        activeClassesInRoom.forEach(cls => {
          let placed = false;
          for (const day of cls.days) {
            if (canPlaceInWeekRoom(cls, day, cls.time)) {
              localSchedule[`${day}-${cls.time}`].push(cls.id);
              placed = true;
              break;
            }
          }

          if (!placed) {
            unscheduledDiagnostics.push({
              week: w,
              room: room.name,
              class: cls
            });
          }
        });

        days.forEach(d => {
          timeslots.forEach(t => {
            const key = `${w}-${d}-${t}-${room.name}`;
            schedule[key] = [...localSchedule[`${d}-${t}`]];
          });
        });
      }
    });
  }

  const isPerfect = unscheduledDiagnostics.length === 0;
  const message = isPerfect
    ? 'All classes allocated successfully across all active program cycles and rooms!'
    : `Allocated term classes, but ${unscheduledDiagnostics.length} cases could not be scheduled due to room capacity conflicts.`;

  return {
    schedule,
    unscheduled: unscheduledDiagnostics,
    message,
    isPerfect,
    classOffsets: offsets
  };
}

// Runs the algorithmic solver to optimize offsets and assign classes week-by-week.
export function solveGILCSchedule(
  classes: ClassDefinition[],
  settings: SolverSettings
): SolverResult {
  const defaultRotations = {
    CP: { frequency: 1, offset: 0 },
    YL: { frequency: 1, offset: 0 },
    GEP: { frequency: 1, offset: 0 }
  };
  const rotations = settings.programRotations || defaultRotations;

  // Let classes with predefined offsets remain locked, only optimize variable classes without pre-defined offsets
  const variableClasses = classes.filter(cls => {
    const rot = rotations[cls.program] || defaultRotations[cls.program];
    return (rot.frequency || 1) > 1 && cls.offset === undefined;
  });

  const offsets: Record<string, number> = {};
  classes.forEach(cls => {
    offsets[cls.id] = cls.offset !== undefined ? cls.offset : 0;
  });

  // Group by program to distribute initial offsets in a balanced way (only for non-preset classes)
  const bySlotProgram: Record<string, ClassDefinition[]> = {};
  variableClasses.forEach(cls => {
    const key = `${cls.time}-${cls.program}`;
    if (!bySlotProgram[key]) bySlotProgram[key] = [];
    bySlotProgram[key].push(cls);
  });

  Object.values(bySlotProgram).forEach(slotClasses => {
    const sorted = [...slotClasses].sort((a, b) => getLevelSequence(a.program, a.level) - getLevelSequence(b.program, b.level));
    sorted.forEach((cls, idx) => {
      const rot = rotations[cls.program] || defaultRotations[cls.program];
      const F = rot.frequency || 1;
      offsets[cls.id] = idx % F;
    });
  });

  let bestResult = solveWithFixedOffsets(classes, settings, offsets);
  let bestOffsets = { ...offsets };

  if (bestResult.unscheduled.length === 0 || variableClasses.length === 0) {
    return bestResult;
  }

  // Local optimization loop (hill-climbing)
  const maxIterations = 150;
  const currentOffsets = { ...bestOffsets };

  for (let iter = 0; iter < maxIterations; iter++) {
    const cls = variableClasses[Math.floor(Math.random() * variableClasses.length)];
    const rot = rotations[cls.program] || defaultRotations[cls.program];
    const F = rot.frequency || 1;

    const prevOffset = currentOffsets[cls.id];
    let nextOffset = Math.floor(Math.random() * F);
    while (nextOffset === prevOffset && F > 1) {
      nextOffset = Math.floor(Math.random() * F);
    }

    currentOffsets[cls.id] = nextOffset;
    const currentResult = solveWithFixedOffsets(classes, settings, currentOffsets);

    if (currentResult.unscheduled.length < bestResult.unscheduled.length) {
      bestResult = currentResult;
      bestOffsets = { ...currentOffsets };
    } else {
      currentOffsets[cls.id] = prevOffset; // revert
    }

    if (bestResult.unscheduled.length === 0) {
      break;
    }
  }

  return bestResult;
}

// Map the term schedule to a flat exportable calendar, starting from Week 1
export function generateFullTermSchedule(
  termSchedule: Record<string, string[]>,
  settings: SolverSettings
): { week: number; day: string; time: string; room: string; classIds: string[] }[] {
  const result: { week: number; day: string; time: string; room: string; classIds: string[] }[] = [];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const timeslots = Array.from(new Set(Object.keys(termSchedule).map(k => k.split('-')[2]))).sort();
  const rooms = [
    { name: 'GILC', maxClassesPerSlot: 2, maxMergedGroupsPerSlot: 2 },
    { name: 'G1', maxClassesPerSlot: 2, maxMergedGroupsPerSlot: 2 }
  ];

  for (let w = 1; w <= settings.termLengthWeeks; w++) {
    days.forEach(day => {
      timeslots.forEach(time => {
        rooms.forEach(room => {
          const key = `${w}-${day}-${time}-${room.name}`;
          const classIds = termSchedule[key] || [];
          result.push({
            week: w,
            day,
            time,
            room: room.name,
            classIds
          });
        });
      });
    });
  }

  return result;
}
