import { z } from "zod";

// Evaluated per parse, not once at module load: a PWA tab can stay open for
// days, and a frozen bound would start rejecting today's date.
function endOfTomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 59, 999);
  return d;
}

export const ResultFormSchema = z.object({
  gameId: z.string().min(1, "Please select a game"),

  date: z.coerce
    .date({ message: "Must be a valid date" })
    .refine((d) => d <= endOfTomorrow(), "Date cannot be in the future"),

  players: z.array(z.string()).min(1, "Please select at least 1 player"),
  winnerIds: z.array(z.string()).min(1, "Please select at least 1 winner"),
});
