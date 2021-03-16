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
        context.isActive=true;
    },
    renderHtml:function(props){
        if (this.timer) window.clearInterval(this.timer);
        this.timer=undefined;
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
        let self=this;
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
                self.sequence=data.sequence;
                chartHandler.setChartElement(chart);
                if (self.timer) window.clearInterval(self.timer);
                let timerInterval=(data.period||30)/5;
                if (timerInterval < 1) timerInterval=1;
                //periodically query the server to check if some data has changed
                self.timer=window.setInterval(function(){
                    let url=AVNAV_BASE_URL + "/api/status";
                    fetch(url)
                        .then(function(resp){return resp.json()})
                        .then(function(status){
                            if (!self.isActive) return;
                            if (status.sequence !== self.sequence){
                                //data in plugin has changed - redraw
                                self.triggerRedraw();
                                window.clearInterval(self.timer);
                                self.timer=undefined;
                            }
                        })
                        .catch(function(error){})
                },timerInterval*1000);
                chartHandler.createChart(data,[fieldDef],props.showLines)

            })
            .catch(function(error){console.log(error)});
    },
    finalizeFunction:function(context){
        if (context.chartHandler){
            context.chartHandler.removeChart();
        }
        if (context.timer){
            window.clearInterval(context.timer);
        }
        context.isActive=false;
    }

}




let fileref=document.createElement('script');
fileref.setAttribute("type","text/javascript");
fileref.setAttribute("src", AVNAV_BASE_URL+"/historychart.js");
fileref.addEventListener('load', function () {
    let statusUrl = AVNAV_BASE_URL + "/api/status";
    let data=undefined;
    let lastQuery=undefined;
    let queryPeriod=3000;
    const fetchData=function(){
        return new Promise(function(resolve,reject){
            let now=(new Date()).getTime();
            if (lastQuery !== undefined && (lastQuery+queryPeriod) >= now){
                resolve(data);
            }
            fetch(statusUrl)
            .then(function (resp) {
                return resp.json()
            })
            .then(function (jsdata) {
                data=jsdata;
                lastQuery=now;
                resolve(data);
            })
            .catch(function(error){reject(error)});
        });
    };
    const getFormatters = function () {
        let formatters = [];
        if (window[chartHandlerName] && window[chartHandlerName].HistoryFormatter) {
            for (let f in window[chartHandlerName].HistoryFormatter) {
                formatters.push(f);
            }
        }
        if (formatters.length < 1) formatters.push("default");
        return formatters;
    }
    const getFields = function(){
        return new Promise(function(resolve,reject){
            fetchData()
            .then(function(fetched){
                resolve(fetched.fields);
            })
            .catch(function(e){reject(e)});
        })
    }
    const hoursFromData = function (data) {
        let hours = [];
        let num = 5;
        for (let i = num; i >= 1; i--) {
            hours.push(Math.ceil(i * data.storeTime / num) + "");
        }
        return hours;
    }
    const getHours = function(){
        return new Promise(function(resolve,reject){
            fetchData()
            .then(function(fetched){
                resolve(hoursFromData(fetched));
            })
            .catch(function(e){reject(e)});
        })
    }
    fetchData()
        .then(function (data) {
            let allowPromise=window.avnav.api.getAvNavVersion && window.avnav.api.getAvNavVersion() >= 20210316;
            let fields=allowPromise?getFields:data.fields;
            let hours=allowPromise?getHours:hoursFromData(data);
            let widgetParameters = {
                formatter: false,
                value: false,
                fieldName: {type: 'SELECT', default: data.fields[0], list: fields},
                color: {type: 'COLOR', default: '#ffffff'},
                fieldFormatter: {type: 'SELECT', default: 'default', list: getFormatters()},
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



