package sharedkernel

type SupportedLocale string

const (
	LocaleVI SupportedLocale = "vi"
	LocaleEN SupportedLocale = "en"
	LocaleJA SupportedLocale = "ja"
	LocaleKO SupportedLocale = "ko"
)

var SupportedLocales = []SupportedLocale{LocaleVI, LocaleEN, LocaleJA, LocaleKO}

const DefaultLocale = LocaleVI

type LocalizedText map[string]string

func ResolveLocalizedText(value LocalizedText, requested SupportedLocale, fallback SupportedLocale) string {
	if text := value[string(requested)]; text != "" {
		return text
	}
	if fallback == "" {
		fallback = DefaultLocale
	}
	if text := value[string(fallback)]; text != "" {
		return text
	}
	for _, text := range value {
		if text != "" {
			return text
		}
	}
	return ""
}
