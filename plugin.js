console.log("avnav history plugin loaded");
let chartHandlerName="avnavHistoryPlugin";

let tryCreateChartHandler=function(context) {
    if (context.chartHandler) return context.chartHandler;
    if (!window[chartHandlerName]) return;
    if (!window[chartHandlerName].HistoryChart) return;
    context.chartHandler = new window[chartHandlerName].HistoryChart(undefined,{tooltip:false});
    return context.chartHandler;
}

let HistoryWidget={
    name: 'HistoryWidget',
    initFunction:function (context){
        tryCreateChartHandler(context);
    },
    renderHtml:function(props){
        return '<div class="chartFrame"></div>';
    },
    /**
     * we must "misuse" the renderCanvas here
     * only when renderCanvas is called all our HTML elements are already created
     * and it will for sure be called whenever the widget is newly rendered
     * @param canvasEl
     * @param props
     */
    renderCanvas:function(canvasEl,props){
        if (!canvasEl) return;
        let widget=canvasEl.parentElement;
        if (! widget) return;
        let chartHandler=tryCreateChartHandler(this);
        if (! chartHandler) return;
        if (!props.fieldName) return;
        let url=AVNAV_BASE_URL+"/api/history?fields="+encodeURIComponent(props.fieldName);
        if (props.hours){
            url+="&fromTime="+encodeURIComponent((new Date().getTime())/1000-3600*props.hours);
        }
        fetch(url)
            .then(function(resp){return resp.json()})
            .then(function(data){
                let fieldDef={
                    name:props.fieldName,
                    formatter: props.fieldFormatter,
                    color: props.color
                };
                let chart=widget.querySelector('.chartFrame');
                if (! chart) return ;
                chartHandler.setChartElement(chart);
                chartHandler.createChart(data,[fieldDef],props.showLines)

            })
            .catch(function(error){console.log(error)});
    },
    finalizeFunction:function(context){
        if (context.chartHandler){
            context.chartHandler.removeChart();
        }
    }

}




let fileref=document.createElement('script');
fileref.setAttribute("type","text/javascript");
fileref.setAttribute("src", AVNAV_BASE_URL+"/historychart.js");
fileref.addEventListener('load', function () {
    let statusUrl = AVNAV_BASE_URL + "/api/status";
    fetch(statusUrl)
        .then(function (resp) {
            return resp.json()
        })
        .then(function (data) {
            if (!data.fields || data.fields.length < 1) {
                window.avnav.api.showToast("no fields for history");
                return;
            }
            let formatters = [];
            if (window[chartHandlerName] && window[chartHandlerName].HistoryFormatter) {
                for (let f in window[chartHandlerName].HistoryFormatter) {
                    formatters.push(f);
                }
            }
            if (formatters.length < 1) formatters.push("default");
            let hours = [];
            let num = 5;
            for (let i = num; i >= 1; i--) {
                hours.push(Math.ceil(i * data.storeTime / num)+"");
            }
            let widgetParameters = {
                formatter: false,
                value: false,
                fieldName: {type: 'SELECT', default: data.fields[0], list: data.fields},
                color: {type: 'COLOR', default: '#ffffff'},
                fieldFormatter: {type: 'SELECT', default: 'default', list: formatters},
                hours: {type: 'SELECT', default: hours[0], list: hours},
                showLines: {type: 'BOOLEAN', default: false}
            };

            window.avnav.api.registerWidget(HistoryWidget, widgetParameters);
        })
        .catch(function (error) {
            window.avnav.api.showToast("history widget error: "+error);
        })
});


document.getElementsByTagName("head")[0].appendChild(fileref)
fileref=document.createElement('script');
fileref.setAttribute("type","text/javascript");
fileref.setAttribute("src", AVNAV_BASE_URL+"/lib/d3.v6.min.js");
document.getElementsByTagName("head")[0].appendChild(fileref)



