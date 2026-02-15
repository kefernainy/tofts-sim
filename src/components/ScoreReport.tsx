"use client";

interface CriterionResult {
  label: string;
  maxPoints: number;
  earned: boolean;
  points: number;
}

interface ConditionScore {
  conditionId: string;
  conditionName: string;
  maxPoints: number;
  earnedPoints: number;
  criteria: CriterionResult[];
}

interface HistoryScore {
  maxPoints: number;
  earnedPoints: number;
  items: { label: string; earned: boolean; points: number }[];
}

interface ScoreReportProps {
  score: number;
  maxScore: number;
  percentage: number;
  conditions: ConditionScore[];
  historyScore: HistoryScore;
  debrief: string;
  onClose: () => void;
}

export default function ScoreReport({
  score,
  maxScore,
  percentage,
  conditions,
  historyScore,
  debrief,
  onClose,
}: ScoreReportProps) {
  const grade =
    percentage >= 90
      ? "A"
      : percentage >= 80
      ? "B"
      : percentage >= 70
      ? "C"
      : percentage >= 60
      ? "D"
      : "F";

  const gradeColor =
    grade === "A"
      ? "text-terminal-green"
      : grade === "B"
      ? "text-terminal-cyan"
      : grade === "C"
      ? "text-terminal-yellow"
      : "text-terminal-red";

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-terminal-surface border border-terminal-border rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Case Debrief
          </h2>
          <div className="flex items-center justify-center gap-4">
            <span className={`text-5xl font-bold ${gradeColor}`}>
              {grade}
            </span>
            <div className="text-left">
              <div className="text-xl font-bold">
                {score}/{maxScore}
              </div>
              <div className="text-terminal-dim text-sm">
                {percentage}%
              </div>
            </div>
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="space-y-4 mb-6">
          {conditions.map((cond) => (
            <div
              key={cond.conditionId}
              className="border border-terminal-border rounded p-3"
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-terminal-cyan">
                  {cond.conditionName}
                </h3>
                <span className="text-sm">
                  {cond.earnedPoints}/{cond.maxPoints} pts
                </span>
              </div>
              <div className="space-y-1">
                {cond.criteria.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span
                      className={
                        c.earned ? "text-terminal-green" : "text-terminal-red"
                      }
                    >
                      {c.earned ? "[+]" : "[-]"}
                    </span>
                    <span
                      className={
                        c.earned ? "text-foreground" : "text-terminal-dim"
                      }
                    >
                      {c.label}
                    </span>
                    <span className="ml-auto text-terminal-dim text-xs">
                      {c.points}/{c.maxPoints}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* History Taking */}
          <div className="border border-terminal-border rounded p-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-terminal-cyan">
                History Taking
              </h3>
              <span className="text-sm">
                {historyScore.earnedPoints}/{historyScore.maxPoints} pts
              </span>
            </div>
            <div className="space-y-1">
              {historyScore.items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className={
                      item.earned
                        ? "text-terminal-green"
                        : "text-terminal-red"
                    }
                  >
                    {item.earned ? "[+]" : "[-]"}
                  </span>
                  <span
                    className={
                      item.earned ? "text-foreground" : "text-terminal-dim"
                    }
                  >
                    {item.label}
                  </span>
                  <span className="ml-auto text-terminal-dim text-xs">
                    {item.points} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Narrative Debrief */}
        <div className="border border-terminal-border rounded p-4 mb-6">
          <h3 className="font-bold text-terminal-yellow mb-3">
            Attending&apos;s Assessment
          </h3>
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {debrief}
          </div>
        </div>

        {/* Close button */}
        <div className="text-center">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-terminal-border hover:bg-terminal-dim text-foreground rounded transition-colors"
          >
            Return to Menu
          </button>
        </div>
      </div>
    </div>
  );
}
