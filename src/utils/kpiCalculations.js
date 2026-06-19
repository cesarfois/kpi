/**
 * Holidays list for Angola and Portugal
 */
export const HOLIDAYS = {
  AO: [
    '01-01', // Ano Novo
    '02-04', // Dia do Início da Luta Armada de Libertação Nacional
    '03-08', // Dia Internacional da Mulher
    '03-23', // Dia da Libertação da África Austral
    '04-04', // Dia da Paz e da Reconciliação Nacional
    '05-01', // Dia Mundial do Trabalho
    '09-17', // Dia do Fundador da Nação e do Herói Nacional
    '11-02', // Dia dos Finados
    '11-11', // Dia da Independência Nacional
    '12-25', // Dia de Natal e da Família
  ],
  PT: [
    '01-01', // Ano Novo
    '04-25', // Dia da Liberdade
    '05-01', // Dia do Trabalhador
    '06-10', // Dia de Portugal
    '08-15', // Assunção de Nossa Senhora
    '10-05', // Implantação da República
    '11-01', // Dia de Todos os Santos
    '12-01', // Restauração da Independência
    '12-08', // Dia da Imaculada Conceição
    '12-25', // Natal
  ]
};

// Default SLA configuration mapping (Workflow + Activity -> SLA in Hours)
// Easily customizable and prepared for future database/config UI integration
export const SLA_CONFIG = {
  'Guia de Remessa': {
    'Faturação': 24,
    'Entrega Total': 48,
    'Classificação das Guias': 24,
    'Contabilização': 12
  },
  'Contratos': {
    'Jurídico': 120,
    'Aprovação': 48
  },
  'Default': 24
};

/**
 * Normalizes input date from various formats
 */
export function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // Format /Date(timestamp)/
  if (typeof dateStr === 'string' && dateStr.startsWith('/Date(')) {
    const ts = parseInt(dateStr.match(/\d+/)[0], 10);
    return new Date(ts);
  }

  // DD/MM/YYYY HH:mm format
  if (typeof dateStr === 'string' && dateStr.includes('/')) {
    const parts = dateStr.split(' ');
    const dateParts = parts[0].split('/');
    if (dateParts.length === 3) {
      const day = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1;
      const year = parseInt(dateParts[2], 10);
      
      let hour = 0, minute = 0, second = 0;
      if (parts[1]) {
        const timeParts = parts[1].split(':');
        hour = parseInt(timeParts[0], 10) || 0;
        minute = parseInt(timeParts[1], 10) || 0;
        second = parseInt(timeParts[2], 10) || 0;
      }
      return new Date(year, month, day, hour, minute, second);
    }
  }

  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Checks if a given date is a holiday
 */
export function isHoliday(date, countryCode = 'AO') {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const key = `${month}-${day}`;
  return (HOLIDAYS[countryCode] || []).includes(key);
}

/**
 * Calculates business hours between two dates
 * Labor hours: 08:00 to 18:00 (10 hours/day)
 */
export function calculateBusinessHours(startDate, endDate, countryCode = 'AO') {
  const start = parseDate(startDate);
  const end = parseDate(endDate) || new Date();
  
  if (!start || isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return 0;
  }

  const startHourLimit = 8;  // 08:00
  const endHourLimit = 18;   // 18:00
  const dailyHours = endHourLimit - startHourLimit; // 10 hours

  let totalHours = 0;

  // Clone date to iterate day by day
  let current = new Date(start.getTime());
  
  // Set current to start of day
  while (current <= end) {
    const dayOfWeek = current.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday

    if (!isWeekend && !isHoliday(current, countryCode)) {
      // Calculate overlapping hours for this day
      let dayStart = new Date(current.getFullYear(), current.getMonth(), current.getDate(), startHourLimit, 0, 0);
      let dayEnd = new Date(current.getFullYear(), current.getMonth(), current.getDate(), endHourLimit, 0, 0);

      let actualStart = start > dayStart ? start : dayStart;
      let actualEnd = end < dayEnd ? end : dayEnd;

      // Ensure boundaries
      if (actualStart < dayEnd && actualEnd > dayStart) {
        if (actualStart < dayStart) actualStart = dayStart;
        if (actualEnd > dayEnd) actualEnd = dayEnd;
        
        const diffMs = actualEnd - actualStart;
        if (diffMs > 0) {
          totalHours += diffMs / (1000 * 60 * 60);
        }
      }
    }

    // Move to next day
    current.setDate(current.getDate() + 1);
    current.setHours(startHourLimit, 0, 0, 0);
  }

  return Math.round(totalHours * 100) / 100;
}

/**
 * Formats duration in hours to 'Xd Yh Zm'
 */
export function formatDuration(hours) {
  if (hours == null || isNaN(hours)) return '0m';
  const totalMinutes = Math.round(hours * 60);
  const days = Math.floor(totalMinutes / (24 * 60));
  const remainingMinutesAfterDays = totalMinutes % (24 * 60);
  const hrs = Math.floor(remainingMinutesAfterDays / 60);
  const mins = remainingMinutesAfterDays % 60;

  let result = [];
  if (days > 0) result.push(`${days}d`);
  if (hrs > 0 || days > 0) result.push(`${String(hrs).padStart(2, '0')}h`);
  result.push(`${String(mins).padStart(2, '0')}m`);

  return result.join(' ');
}

/**
 * Core function to normalize and calculate all Calc_ columns for a single DocuWare row
 */
export function calculateRowKPIs(row, countryCode = 'AO', customSlas = {}) {
  // Normalize base columns
  // BASE_DataInicio
  const dataInicioStr = row['Data Início Tarefa'] || row['Data de Inicio'] || row['Data Inicio'] || row['Data de Início'] || row['Iniciado Em'] || '';
  const dataInicio = parseDate(dataInicioStr);

  // BASE_DataFim
  const dataFimStr = row['Data Decisão'] || row['Decision Date'] || row['Fim Tarefa'] || row['Data de Fim'] || '';
  const dataFim = parseDate(dataFimStr);

  // BASE_Usuario
  const usuarioRaw = row['Usuário'] || row['User'] || row['Responsável'] || row['Processor'] || '';
  
  // Instance/Workflow name and Activity name
  const workflowName = row['Instância'] || row['Instance'] || 'Default';
  const activityName = row['Atividade'] || row['Activity'] || 'Default';

  // 1. Calc_SLA_Horas
  let sla = SLA_CONFIG.Default;
  if (typeof customSlas === 'number') {
    sla = customSlas;
  } else if (typeof customSlas === 'string' && !isNaN(parseFloat(customSlas))) {
    sla = parseFloat(customSlas);
  } else if (customSlas && typeof customSlas === 'object' && customSlas['Default'] !== undefined) {
    sla = parseFloat(customSlas['Default']) || SLA_CONFIG.Default;
  } else if (customSlas && typeof customSlas === 'object' && customSlas[`${workflowName}::${activityName}`]) {
    sla = parseFloat(customSlas[`${workflowName}::${activityName}`]);
  } else if (SLA_CONFIG[workflowName] && SLA_CONFIG[workflowName][activityName]) {
    sla = SLA_CONFIG[workflowName][activityName];
  } else if (row['SLA_1'] || row['SLA']) {
    sla = parseFloat(row['SLA_1'] || row['SLA']) || SLA_CONFIG.Default;
  }

  // 2. Calc_TempoExecucaoHoras
  let executionHours = 0;
  if (dataInicio) {
    const end = dataFim || new Date();
    const diffMs = end - dataInicio;
    executionHours = diffMs > 0 ? diffMs / (1000 * 60 * 60) : 0;
  }
  executionHours = Math.round(executionHours * 100) / 100;

  // 3. Calc_HorasUteis
  const businessHours = calculateBusinessHours(dataInicio, dataFim, countryCode);

  // 4. Calc_DiasUteis (assuming standard 8-hour workday for executive analysis)
  const businessDays = Math.round((businessHours / 8) * 100) / 100;

  // 5. Calc_TempoFormatado
  const tempoFormatado = formatDuration(executionHours);

  // 6. Calc_StatusSLA
  // Comparison is made against real elapsed time or business hours. 
  // By operational requirements, we check against business hours as it represents the active SLA.
  let statusSla = 'Dentro do Prazo';
  if (businessHours > sla * 2) {
    statusSla = 'Atraso Inaceitável';
  } else if (businessHours > sla) {
    statusSla = 'Atraso Moderado';
  }

  // 7. Calc_TaskAtual
  const taskAtual = !dataFim ? activityName : '';

  // 8. Calc_ConclusaoTarefa
  const conclusao = dataFim ? 'Concluída' : 'Pendente';

  // 9. Calc_ResponsavelSLA
  // Group detection: if Usuário has comma or is empty but represents a team
  const isGroup = usuarioRaw.includes(',') || usuarioRaw.trim() === '';
  let responsavelSla = usuarioRaw;

  if (conclusao === 'Pendente') {
    if (isGroup) {
      responsavelSla = `Equipe - ${activityName}`;
    }
  } else {
    // Concluded
    if (statusSla !== 'Dentro do Prazo' && isGroup) {
      // Completed late on group task - penalize group, not individual
      responsavelSla = `Equipe - ${activityName}`;
    }
  }

  if (!responsavelSla) {
    responsavelSla = `Equipe - ${activityName}`;
  }

  const desvioSlaHoras = Math.round((businessHours - sla) * 100) / 100;

  return {
    ...row, // Preserve original columns untouched
    'Calc_SLA_Horas': sla,
    'Calc_TempoExecucaoHoras': executionHours,
    'Calc_HorasUteis': businessHours,
    'Calc_DiasUteis': businessDays,
    'Calc_TempoFormatado': tempoFormatado,
    'Calc_StatusSLA': statusSla,
    'Calc_TaskAtual': taskAtual,
    'Calc_ConclusaoTarefa': conclusao,
    'Calc_ResponsavelSLA': responsavelSla,
    'Calc_DesvioSLAHoras': desvioSlaHoras
  };
}
