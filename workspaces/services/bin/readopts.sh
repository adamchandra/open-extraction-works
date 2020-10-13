#!/bin/sh


infile="$1"

RED='\033[0;41;30m'
STD='\033[0;0;39m'

pause(){
    read -p "Press [Enter] key to continue..." fackEnterKey
}

allokay(){
	  echo "everything is okay with $infile.all.okay.gt"
    touch "$infile.all.okay.gt"
    exit 0
}

skip(){
	  echo "skip $infile"
    touch "$infile.skip.gt"
    exit 0
}

mark(){
	  echo "makr $infile"
    touch "$infile.mark.gt"
    exit 0
}

zero(){
	  echo "skipping"
    exit 0
}

show_menus() {
	  echo "~~~~~~~~~~~~~~~~~~~~~"
	  echo " Assert Ground Truth "
	  echo "~~~~~~~~~~~~~~~~~~~~~"
	  echo "1. Everything Okay"
	  echo "2. Skip"
	  echo "3. Mark"
}

read_options(){
	  local choice
	  read -p "choice> " choice
	  case $choice in
		    1) allokay ;;
		    2) skip ;;
		    3) mark ;;
	  esac
}

while true
do
	  show_menus
	  read_options
done
