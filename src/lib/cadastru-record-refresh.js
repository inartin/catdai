import { fetchExternalCadastralData } from "@/lib/cadastru-external-api";
import { persistCadastruRecord } from "@/lib/cadastru-records";
import { scheduleCadastruRefresh, isUsableCadastruRefresh } from "@/lib/cadastru-refresh";

export function scheduleCadastruNumberRefresh(entry) {
  const number = entry.payload.cadastral_number;
  scheduleCadastruRefresh(`number:${number.replace(/\D/g, "")}`, async () => {
    const payload = await fetchExternalCadastralData(number, { trackUsage: false });
    if (!isUsableCadastruRefresh(entry.payload, payload)) return;
    await persistCadastruRecord({ ...payload, district_lookup_checked: true }, {
      cadastralNumber: number, lookupSource: "api", officialFetch: true, countLookup: false,
    });
  });
}

