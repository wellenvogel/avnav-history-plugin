import time
import threading
import serial
import time
import os
import datetime
import sys
import re
import glob

REC_HDR='H'
REC_DATA='D'

class HistoryFileWriter:
  def __init__(self,filename,fields,ts=None):
    self.filename=filename
    self.fields=fields
    self.file=open(filename,"a")
    if ts is None:
      ts=time.time()
    self.file.write("\n")  #if the previous line was not completed...
    self.writeRecord(REC_HDR,[str(ts)]+self.fields,False)

  def isOpen(self):
    return self.file is not None

  def writeRecord(self,type,fields,toStrings=True):
    self.file.write("%s,"%type)
    if toStrings:
      self.file.write(",".join(map(lambda a: str(a) if a is not None else '',fields)))
    else:
      self.file.write(",".join(fields))
    self.file.write("\n")
    self.file.flush()

  def close(self):
    if self.file is None:
      return
    self.file.close()


class HistoryFileReader:
  def __init__(self,filename,fields):
    self.filename=filename
    self.fields=fields
    self.file=None
    self.requestedFields=fields
    if os.path.isfile(filename):
      self.file=open(filename,"r")

  def isOpen(self):
    return self.file is not None

  def computeMappings(self,newHdrLine):
    if len(newHdrLine) < 3:
      return None
    mappings={}
    for f in range(0,len(self.fields)):
      for i in range(2,len(newHdrLine)):
        if newHdrLine[i]==self.fields[f]:
          mappings[i]=f
    return mappings

  def getRecords(self,minTime=None,maxTime=None):
    self.file.seek(0)
    rt=[]
    #mapping maps the filed in the file to the position
    #in the putput array
    mapping=None
    try:
      for line in self.file:
        fields = line.rstrip().split(",")
        if line.startswith(REC_HDR):
          mapping=self.computeMappings(fields)
          continue
        if mapping is None:
          continue
        if not line.startswith(REC_DATA):
          continue
        if len(fields) < 3:
          continue
        try:
          ts=float(fields[1])
        except:
          self.api.debug("unable to get time for record %s",line)
          continue
        if minTime is not None and ts < minTime:
          continue
        if maxTime is not None and ts > maxTime:
          return rt
        opline=[None] * (len(self.fields)+1)
        opline[0]=ts #timestamp
        hasFields=False
        for i in range(2,len(fields)):
          idx=mapping.get(i)
          if idx is None:
            continue
          opline[idx+1]=fields[i]
          hasFields=True
        if hasFields:
          rt.append(opline)
    except Exception as e:
      self.api.error("Error reading from file %s: %s",self.filename,unicode(e.message))
    return rt

  def close(self):
    if self.file is None:
      return
    self.file.close()


class Plugin:

  @classmethod
  def pluginInfo(cls):
    """
    the description for the module
    @return: a dict with the content described below
            parts:
               * description (mandatory)
               * data: list of keys to be stored (optional)
                 * path - the key - see AVNApi.addData, all pathes starting with "gps." will be sent to the GUI
                 * description
    """
    return {
      'description': 'seatalk remote control',
      'config': [
        {
          'name': 'enabled',
          'description': 'set to true to enable plugin',
          'default': 'true'
        },
        {
          'name': 'sensorNames',
          'description': 'the sensor names we look for in XDR records separated by ,',
          'default': None
        },
        {
          'name': 'period',
          'description': 'period for writing in s',
          'default': '5'
        }
        ,
        {
          'name': 'storeTime',
          'description': 'how long to store the history (h)',
          'default': '28'
        }

        ],
      'data': [
      ]
    }

  def __init__(self,api):
    """
        initialize a plugins
        do any checks here and throw an exception on error
        do not yet start any threads!
        @param api: the api to communicate with avnav
        @type  api: AVNApi
    """
    self.api = api # type: AVNApi
    #we register an handler for API requests
    self.api.registerRequestHandler(self.handleApiRequest)
    self.sensorNames=None
    self.values=[]
    self.baseDir=None
    self.storeTime=None
    self.period=None


  def computeFileName(self,daysDiff=0):
    now=datetime.datetime.utcnow()
    if daysDiff != 0:
      now+=datetime.timedelta(days=daysDiff)
    return os.path.join(self.baseDir,unicode(now.strftime("%Y-%m-%d")+".avh"))

  def getConfigValue(self,name):
    defaults=self.pluginInfo()['config']
    for cf in defaults:
      if cf['name'] == name:
        return self.api.getConfigValue(name,cf.get('default'))
    return self.api.getConfigValue(name)

  def run(self):
    """
    the run method
    this will be called after successfully instantiating an instance
    this method will be called in a separate Thread
    The example simply counts the number of NMEA records that are flowing through avnav
    and writes them to the store every 10 records
    @return:
    """
    seq=0
    self.api.log("started")
    enabled=self.getConfigValue('enabled')
    if enabled is not None and enabled.lower()!='true':
      self.api.setStatus("INACTIVE", "disabled by config")
      return
    sensors=self.getConfigValue('sensorNames')
    if sensors is None:
      self.api.setStatus("ERROR", "no parameter sensorNames configured")
      return
    self.sensorNames=sensors.split(",")
    if self.sensorNames[0] == "":
      self.api.setStatus("ERROR", "empty parameter sensorNames configured")
      return
    self.baseDir=os.path.join(self.api.getDataDir(),"plugins","barograph")
    if not os.path.exists(self.baseDir):
      os.makedirs(self.baseDir)
    if not os.path.isdir(self.baseDir):
      self.api.setStatus("ERROR", "unable to create basedir %s"%self.baseDir)
      return
    try:
      self.storeTime=int(self.getConfigValue('storeTime'))
    except Exception as e:
      self.api.setStatus("ERROR", "error getting storeTime: %s" % unicode(e.message))
      return
    try:
      self.period=int(self.getConfigValue('period'))
    except Exception as e:
      self.api.setStatus("ERROR", "error getting period: %s" % unicode(e.message))
      return
    minTime=time.time()-self.storeTime*24*3600
    previousFile=self.computeFileName(-1)
    try:
      if os.path.exists(previousFile):
        self.api.log("reading previous file %s", previousFile)
        #TODO: minTime
        reader=HistoryFileReader(previousFile,self.sensorNames)
        self.values.extend(reader.getRecords(minTime))
        reader.close()
      currentFile=self.computeFileName()
      if os.path.exists(currentFile):
        self.api.log("reading current file %s", currentFile)
        # TODO: minTime
        reader = HistoryFileReader(currentFile, self.sensorNames)
        self.values.extend(reader.getRecords(minTime))
        reader.close()
      self.api.log("%d entries in history",len(self.values))
    except Exception as e:
      self.api.error("error reading history: %s",unicode(e.message))
    cleanupThread=threading.Thread(target=self.cleanup,name="barograph-cleanup")
    cleanupThread.setDaemon(True)
    cleanupThread.start()
    currentValues={}
    for f in self.sensorNames:
      currentValues[f]=None
    lastWrite=0
    hasValues=False
    hwriter=HistoryFileWriter(currentFile,self.sensorNames)
    self.api.setStatus("INACTIVE","writing to %s"%currentFile)
    dataReceived=False
    while True:
      seq,data=self.api.fetchFromQueue(seq,10,filter="$XDR")
      if len(data) > 0:
        for line in data:
          #$--XDR,a,x.x,a,c--c, ..... *hh<CR><LF>
          line=re.sub("\*.*","",line)
          fields=line.split(",")
          lf=len(fields)
          i=0
          while i < lf:
            if i < (lf-3):
              try:
                #we need 4 fields
                ttype=fields[i]
                tdata=float(fields[i+1])
                tunit=fields[i+2]
                tname=fields[i+3]
                if tname in self.sensorNames:
                  self.api.debug("received %f for %s")
                  currentValues[tname]=tdata
                  hasValues=True
              except Exception as e:
                self.api.error("NMEA error in %s: %s",line,unicode(e.message))
            i+=4
      now=time.time()
      if hasValues and (now >= (lastWrite+self.period) or now < lastWrite):
        if not dataReceived:
          self.api.setStatus("NMEA","writing to %s"%hwriter.filename)
          dataReceived=True
        record=[now]
        for f in self.sensorNames:
          v=currentValues[f]
          currentValues[f]=None
          record.append(v)
        nextFile=self.computeFileName()
        if nextFile != hwriter.filename:
          self.api.log("opening new file %s",nextFile)
          dataReceived=False
          hwriter.close()
          hwriter=HistoryFileWriter(nextFile,self.sensorNames)
        self.values.append(record)
        hwriter.writeRecord(REC_DATA,record)
        lastWrite=now

  def cleanup(self):
    while True:
      self.api.debug("cleanup loop")
      cleanupTime=time.time()-self.storeTime*24*3600
      numRemoved=0
      while len(self.values) >0 and self.values[0][0] < cleanupTime:
        self.values.pop(0)
        numRemoved+=1
      self.api.debug("removed %d entries from history",numRemoved)
      keepDays=int(self.storeTime/24)+1
      keepFiles=[self.computeFileName(),self.computeFileName(+1)]
      for d in range(1,keepDays+1):
        keepFiles.append(self.computeFileName(-d))
      currentFiles = glob.glob(os.path.join(self.baseDir, u"*.avh"))
      for file in currentFiles:
        if file in keepFiles:
          continue
        self.api.log("removing old file %s",file)
        os.remove(file)
      time.sleep(60)


  def handleApiRequest(self,url,handler,args):
    """
    handler for API requests send from the JS
    @param url: the url after the plugin base
    @param handler: the HTTP request handler
                    https://docs.python.org/2/library/basehttpserver.html#BaseHTTPServer.BaseHTTPRequestHandler
    @param args: dictionary of query arguments
    @return:
    """
    if url == 'status':
      return {'status': 'OK',
              'numRecords':len(self.values),
              'oldest': self.values[0][0] if len(self.values) else None,
              'fields': self.sensorNames,
              'period': self.period
              }
    if url == 'history':
      fromTime=args.get('fromTime')
      if fromTime is not None:
        fromTime=int(fromTime[0])
      values=self.values
      if fromTime is not None:
        values=filter(lambda r: r[0] >= fromTime,self.values)
      return {
        'status':'OK',
        'fields': self.sensorNames,
        'period': self.period,
        'data':values
      }

    return {'status','unknown request'}


if __name__ == '__main__':
  #testing
  if len(sys.argv) < 6:
    print("usage: %s filename interval num start stop",sys.argv[0])
    sys.exit(1)
  fn=sys.argv[1]
  iv=int(sys.argv[2])
  num=int(sys.argv[3])
  start=float(sys.argv[4])
  stop=float(sys.argv[5])
  incr=(stop-start)/float(num)
  fields=["test1","test2"]
  now=time.time()
  starttime=now-iv*num
  wr=HistoryFileWriter(fn,fields)
  for i in range(0,num):
    wr.writeRecord(REC_DATA,[starttime,start,stop])
    start+=incr
    stop-=incr
    starttime+=iv

  wr.close()

