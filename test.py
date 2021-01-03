#! /usr/bin/env python

from plugin import *
import random

def err(text):
  print("ERROR: %s"%text)
  sys.exit(1)


def dtToTs(dt):
  DAY = 24 * 60 * 60  # POSIX day in seconds (exact value)
  timestamp = (dt.toordinal() - datetime.datetime(1970, 1, 1).toordinal()) * DAY
  timestamp = (dt - datetime.datetime(1970, 1, 1)).days * DAY
  return timestamp

if __name__ == '__main__':
  #testing
  modes = "create|read"
  if len(sys.argv) < 2:
    err("usage: %s %s ..."%(sys.argv[0],modes))
  mode=sys.argv[1]
  if mode == 'create':
    if len(sys.argv) < 5:
      print("usage: %s create yyyy-mm-dd fields (fieldname:start:stop) interval"%sys.argv[0])
      sys.exit(1)
    fn=sys.argv[2]+".avh"
    parts=sys.argv[2].split("-")
    if len(parts) != 3:
      err("you must provide yyyy-mm-dd for the date")
    dt=datetime.datetime(year=int(parts[0]),month=int(parts[1]),day=int(parts[2]))
    ts=dtToTs(dt)
    iv = int(sys.argv[4])
    num = 24 * 3600 / iv
    fields=sys.argv[3].split(",")
    fieldNames=[]
    fieldConfig={}
    for f in fields:
      (name,start,stop)=f.split(":")
      fieldNames.append(name)
      start=float(start)
      stop=float(stop)
      incr = (stop - start) / float(num)
      fieldConfig[name]={'start':start,'stop':stop,'incr':incr,'rnd':(stop-start)/30.0}
    starttime=ts
    wr=HistoryFileWriter(fn,fieldNames)
    for i in range(0,num):
      record=[starttime]
      for f in fieldNames:
        cfg=fieldConfig[f]
        v=(-0.5 + random.random())*cfg['rnd']+cfg['start']
        cfg['start']=cfg['start']+cfg['incr']
        record.append(v)
      wr.writeRecord(REC_DATA,record)
      starttime+=iv

    wr.close()
    sys.exit(0)

  if mode == 'read':
    if len(sys.argv) < 4:
      print("usage: %s filename fields"%sys.argv[0])
      sys.exit(1)
    fn=sys.argv[2]
    fields=sys.argv[3].split(",")
    rd=HistoryFileReader(fn,fields)
    if not rd.isOpen():
      err("file %s not found"%fn)
    values=[]
    values.extend(rd.getRecords())
    for r in values:
      print("#%d:%s"%(r[0],",".join(map(lambda a: str(a),r[1:]))))

    sys.exit(0)

  print("invalid mode %s"%mode)
  sys.exit(1)
