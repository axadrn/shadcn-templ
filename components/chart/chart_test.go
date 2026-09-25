package chart

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"testing"

	"github.com/a-h/templ"
)

func renderModel(t *testing.T, config Config, root, children templ.Component) map[string]any {
	t.Helper()
	var out bytes.Buffer
	chart := templ.ComponentFunc(func(ctx context.Context, w io.Writer) error {
		return root.Render(templ.WithChildren(ctx, children), w)
	})
	if err := Container(ContainerProps{Config: config}).Render(templ.WithChildren(context.Background(), chart), &out); err != nil {
		t.Fatal(err)
	}
	_, rest, ok := strings.Cut(out.String(), `<script type="application/json" data-templ-chart-model>`)
	if !ok {
		t.Fatal("model script missing")
	}
	payload, _, ok := strings.Cut(rest, "</script>")
	if !ok {
		t.Fatal("model script not closed")
	}
	var model map[string]any
	if err := json.Unmarshal([]byte(payload), &model); err != nil {
		t.Fatal(err)
	}
	return model
}

func TestLineModelValues(t *testing.T) {
	m := renderModel(t, Config{{Key: "value"}}, LineChart(LineChartProps{Data: []Datum{{"value": 10}, {"value": 20}, {"value": 30}}}), Line(LineProps{DataKey: "value"}))
	s := m["series"].([]any)[0].(map[string]any)
	if len(s["values"].([]any)) != 3 {
		t.Fatalf("values: %v", s["values"])
	}
	if _, ok := s["gaps"]; ok {
		t.Fatalf("full series has gaps: %v", s)
	}
}

func TestValueScale(t *testing.T) {
	m := renderModel(t, nil, LineChart(LineChartProps{Data: []Datum{{"a": 10, "b": 20}, {"a": 20, "b": 30}}}), templ.Join(YAxis(YAxisProps{TickFormatter: func(v any) string { return fmt.Sprintf("%v units", v) }}), Line(LineProps{DataKey: "a"}), Line(LineProps{DataKey: "b"})))
	if got := fmt.Sprintf("%.9g", m["ticks"]); got != "[0 8 16 24 32]" {
		t.Fatalf("ticks: %s", got)
	}
	if got := fmt.Sprint(m["tickLabels"]); got != "[0 units 8 units 16 units 24 units 32 units]" {
		t.Fatalf("labels: %s", got)
	}
}

func TestAxisDomain(t *testing.T) {
	for _, tc := range []struct {
		name          string
		axis          YAxisProps
		domain, ticks string
	}{
		{"ticks", YAxisProps{Ticks: []float64{0, 100, 200, 300}}, "[0 300]", "[0 100 200 300]"},
		{"data", YAxisProps{Domain: []any{"dataMin", "dataMax"}}, "[180 220]", "[180 190 200 210 220]"},
		{"extend", YAxisProps{Domain: []any{100, 200}}, "[100 220]", "[100 130 160 190 220]"},
		{"overflow", YAxisProps{Domain: []any{100, 200}, AllowDataOverflow: true}, "[100 200]", "[100 125 150 175 200]"},
		{"offset", YAxisProps{Domain: []any{"dataMin - 10", "dataMax + 10"}}, "[170 230]", "[170 185 200 215 230]"},
		{"both", YAxisProps{Domain: []any{100, 240}, Ticks: []float64{100, 180, 240}}, "[100 240]", "[100 180 240]"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for _, vertical := range []bool{false, true} {
				data := []Datum{{"v": 180}, {"v": 200}, {"v": 220}}
				root := LineChart(LineChartProps{Data: data})
				children := templ.Join(YAxis(tc.axis), Line(LineProps{DataKey: "v"}))
				if vertical {
					root = BarChart(BarChartProps{Data: data, Layout: "vertical"})
					children = templ.Join(XAxis(XAxisProps{Ticks: tc.axis.Ticks, Domain: tc.axis.Domain, AllowDataOverflow: tc.axis.AllowDataOverflow}), Bar(BarProps{DataKey: "v"}))
				}
				m := renderModel(t, nil, root, children)
				if got := fmt.Sprintf("%.9g", m["domain"]); got != tc.domain {
					t.Errorf("vertical=%v domain=%s want %s", vertical, got, tc.domain)
				}
				if got := fmt.Sprintf("%.9g", m["ticks"]); got != tc.ticks {
					t.Errorf("vertical=%v ticks=%s want %s", vertical, got, tc.ticks)
				}
			}
		})
	}
}

func TestDomainLength(t *testing.T) {
	for _, axis := range []string{"XAxisProps", "YAxisProps"} {
		t.Run(axis, func(t *testing.T) {
			defer func() {
				if r := recover(); r == nil || !strings.Contains(fmt.Sprint(r), axis+".Domain") {
					t.Fatalf("panic = %v", r)
				}
			}()
			st := &chartState{kind: "line"}
			if axis == "XAxisProps" {
				st.x = &XAxisProps{Domain: []any{0}}
			} else {
				st.y = &YAxisProps{Domain: []any{0, 1, 2}}
			}
			buildModel(context.Background(), st)
		})
	}
}

func TestParseSpecifiedDomain(t *testing.T) {
	for _, tc := range []struct {
		spec     []any
		overflow bool
		want     [2]float64
	}{
		{[]any{"auto", "auto"}, false, [2]float64{180, 220}},
		{[]any{"unknown", "dataMax + nope"}, false, [2]float64{180, 220}},
		{[]any{"dataMin - 2.5", "dataMax + 0.25"}, false, [2]float64{177.5, 220.25}},
		{[]any{190.0, 200.0}, false, [2]float64{180, 220}},
		{[]any{190.0, 200.0}, true, [2]float64{190, 200}},
	} {
		if got := parseSpecifiedDomain(tc.spec, [2]float64{180, 220}, tc.overflow); got != tc.want {
			t.Errorf("%v: %v want %v", tc.spec, got, tc.want)
		}
	}
}

func TestGaps(t *testing.T) {
	data := []Datum{{"a": 180, "b": 200}, {"b": 220}, {"a": 200, "b": 210}}
	m := renderModel(t, nil, LineChart(LineChartProps{Data: data}), templ.Join(YAxis(YAxisProps{Domain: []any{"dataMin", "dataMax"}}), Line(LineProps{DataKey: "a"}), Line(LineProps{DataKey: "b"})))
	series := m["series"].([]any)
	if got := fmt.Sprint(series[0].(map[string]any)["gaps"]); got != "[false true false]" {
		t.Fatalf("gaps: %s", got)
	}
	if _, ok := series[1].(map[string]any)["gaps"]; ok {
		t.Fatal("full series has gaps")
	}
	if got := fmt.Sprint(m["domain"]); got != "[180 220]" {
		t.Fatalf("gap changed domain: %s", got)
	}
}

func TestDotShow(t *testing.T) {
	data := []Datum{{"v": 10}, {"v": 20}, {"v": 30}, {"v": 40}}
	calls := 0
	m := renderModel(t, nil, LineChart(LineChartProps{Data: data}), Line(LineProps{DataKey: "v", Dot: &DotProps{Show: func(index int, row Datum) bool { calls++; return index%2 == 1 && row["v"].(int) >= 20 }}}))
	dot := m["series"].([]any)[0].(map[string]any)["dot"].(map[string]any)
	if calls != 4 || fmt.Sprint(dot["shown"]) != "[false true false true]" {
		t.Fatalf("calls=%d dot=%v", calls, dot)
	}
	m = renderModel(t, nil, LineChart(LineChartProps{Data: data}), Line(LineProps{DataKey: "v", Dot: &DotProps{}}))
	dot = m["series"].([]any)[0].(map[string]any)["dot"].(map[string]any)
	if _, ok := dot["shown"]; ok {
		t.Fatal("nil predicate must omit shown")
	}
}

func TestHiddenSeries(t *testing.T) {
	data := []Datum{{"a": 10, "b": 1000, "c": 20}, {"a": 20, "b": 2000, "c": 30}, {"a": 30, "b": 3000, "c": 40}}
	for _, kind := range []string{"line", "bar", "area"} {
		t.Run(kind, func(t *testing.T) {
			var root, children templ.Component
			wantDomain := "[0 40]"
			switch kind {
			case "line":
				root = LineChart(LineChartProps{Data: data})
				children = templ.Join(Line(LineProps{DataKey: "a"}), Line(LineProps{DataKey: "b", Hide: true}), Line(LineProps{DataKey: "c"}))
			case "bar":
				root = BarChart(BarChartProps{Data: data})
				children = templ.Join(Bar(BarProps{DataKey: "a", StackID: "s"}), Bar(BarProps{DataKey: "b", StackID: "s", Hide: true}), Bar(BarProps{DataKey: "c", StackID: "s"}))
				wantDomain = "[0 80]"
			case "area":
				root = AreaChart(AreaChartProps{Data: data})
				children = templ.Join(Area(AreaProps{DataKey: "a", StackID: "s"}), Area(AreaProps{DataKey: "b", StackID: "s", Hide: true}), Area(AreaProps{DataKey: "c", StackID: "s"}))
				wantDomain = "[0 80]"
			}
			m := renderModel(t, nil, root, children)
			series := m["series"].([]any)
			if len(series) != 3 || series[1].(map[string]any)["hidden"] != true {
				t.Fatalf("hidden series lost: %v", series)
			}
			if got := fmt.Sprint(m["domain"]); got != wantDomain {
				t.Fatalf("domain=%s want %s", got, wantDomain)
			}
		})
	}
}

func TestNumericXAxisFormatter(t *testing.T) {
	m := renderModel(t, nil, BarChart(BarChartProps{Layout: "vertical", Data: []Datum{{"v": 10}, {"v": 20}}}), templ.Join(XAxis(XAxisProps{Ticks: []float64{0, 10, 20}, TickFormatter: func(v any) string { return fmt.Sprintf("<%v>", v) }}), Bar(BarProps{DataKey: "v"})))
	if got := fmt.Sprint(m["tickLabels"]); got != "[<0> <10> <20>]" {
		t.Fatalf("numeric X labels: %s", got)
	}
}

func TestNumericAxisTickCount(t *testing.T) {
	for _, tc := range []struct {
		name, layout              string
		xCount, yCount, wantCount int
		wantTicks                 string
	}{
		{"numeric x", "vertical", 3, 8, 3, "[0 40 80]"},
		{"category y ignored", "vertical", 0, 3, 0, "[0 20 40 60 80]"},
		{"vertical default", "vertical", 0, 0, 0, "[0 20 40 60 80]"},
		{"numeric y", "", 8, 3, 3, "[0 40 80]"},
		{"category x ignored", "", 3, 0, 0, "[0 20 40 60 80]"},
		{"default layout", "", 0, 0, 0, "[0 20 40 60 80]"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			m := renderModel(t, nil, BarChart(BarChartProps{Layout: tc.layout, Data: []Datum{{"v": 20}, {"v": 80}}}), templ.Join(
				XAxis(XAxisProps{TickCount: tc.xCount}), YAxis(YAxisProps{TickCount: tc.yCount}), Bar(BarProps{DataKey: "v"}),
			))
			if got := fmt.Sprintf("%.9g", m["ticks"]); got != tc.wantTicks {
				t.Fatalf("ticks=%s want %s", got, tc.wantTicks)
			}
			if tc.wantCount == 0 {
				if _, ok := m["tickCount"]; ok {
					t.Fatalf("default tickCount should be omitted: %v", m["tickCount"])
				}
			} else if m["tickCount"] != float64(tc.wantCount) {
				t.Fatalf("tickCount=%v want %d", m["tickCount"], tc.wantCount)
			}
		})
	}
}
