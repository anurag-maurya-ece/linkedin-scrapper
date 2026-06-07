import requests,json

api_key="api token"

url="enter the url from extractor api"


def add(profile):
    try: 
        with open("links.json") as f:
            temp=json.load(f)
        
    except FileNotFoundError:
        temp=[]
    temp.append(profile)
    with open("links.json","w") as f:
        json.dump(temp,f)


def data_list():
    try: 
        with open("links.json") as f:
            temp_list=json.load(f)
        
    except FileNotFoundError:
        temp_list=[]
    return temp_list
def head(api_key):
    headers={
    "Content-Type": "application/json",
    "Accept": "application/json",
    "token":api_key

}
    return headers

def results():
    data={
    "profiles": data_list()
}
    req=requests.post(url,headers=head(api_key),json=data)
    data=req.json()
    for idx in data["profiles"].values():
        if idx!=[]:
            print(idx)
        else:
            print("result not found!")
    
def export(file):
    with open(file) as f:
        lead=json.load(f)
    with open("exports.json","w") as f:
        json.dump(lead,f)
while True:
    prompt="""1. TO ADD A LINKEDIN LINK
    2. ENTER/UPDATE YOUR API KEY
    3. SEE RESULTS
    4. EXPORT AS JSON"""
    print(prompt)
    user_input=input()
    if user_input=="1":
        print("enter the link")
        profile=input()
        add(profile)

    elif user_input=="2":
        api_key=input("enter new apikey")
        head(api_key)
    elif user_input==3:
        results()
    elif user_input==4:
        export("links.json")


    